import { test, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { FakeDir, FakeFile } from './fakefs.js'

let store, ws, search, prefs, fa, saveall
before(async () => {
  globalThis.indexedDB = new IDBFactory()
  store = await import('../src/store.js')
  await store.useBackend()
  ws = await import('../src/workspace.js')
  search = await import('../src/search.js')
  ;({ prefs } = await import('../src/prefs.js'))
  fa = await import('../src/fileaccess.js')
  saveall = await import('../src/saveall.js')
  globalThis.showOpenFilePicker = async () => []
  globalThis.showSaveFilePicker = async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) }
})

let project, w
beforeEach(async () => {
  for (const d of [...store.state.docs]) await store.deleteDoc(d.id)
  project = new FakeDir('app', {
    'README.md': 'Say hello\n',
    src: { 'main.js': 'const hello = 1\nhello()\n', 'util.js': 'nothing here\n' },
    node_modules: { lib: { 'index.js': 'hello from a dependency' } },
    '.git': { HEAD: 'hello' },
    'big.txt': 'hello '.repeat(400_000),
    'logo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 1, 2, 3]),
  })
  globalThis.showDirectoryPicker = async () => project
  w = await ws.openFolder()
})
afterEach(async () => {
  await ws.closeFolder(w.id)
  prefs.trimOnSave = false
  prefs.finalNewline = false
})

// --- Pure parts ---------------------------------------------------------------------------

test('file filters: names, paths, globs and exclusions', () => {
  const f = search.pathFilter('*.js, docs/')
  assert.equal(f('app/src/main.js'), true)
  assert.equal(f('app/docs/intro.md'), true)
  assert.equal(f('app/README.md'), false)
  const g = search.pathFilter('!*.min.js, !test/')
  assert.equal(g('a/x.js'), true)
  assert.equal(g('a/x.min.js'), false)
  assert.equal(g('a/test/x.js'), false)
  assert.equal(search.pathFilter('src/**/*.vue')('app/src/components/deep/A.vue'), true)
  assert.equal(search.pathFilter('src/**/*.vue')('app/src/A.vue'), true)
  assert.equal(search.pathFilter('README*')('app/README.md'), true)
  assert.equal(search.pathFilter('READ?E.md')('README.md'), true)
  assert.equal(search.pathFilter('')('anything'), true)
})

test('matches come with line, column and a preview of their line', () => {
  const text = 'first line\n  say hello there\nhello again\n'
  const found = search.searchText(text, 'hello')
  assert.deepEqual(found.map((m) => [m.line, m.col]), [[2, 7], [3, 1]])
  assert.deepEqual([found[0].before, found[0].text, found[0].after], ['say ', 'hello', ' there'])
  assert.equal(text.slice(found[1].from, found[1].to), 'hello')
  const long = 'x'.repeat(300) + 'needle' + 'y'.repeat(300)
  const [m] = search.searchText(long, 'needle')
  assert.ok(m.before.startsWith('…') && m.after.endsWith('…'))
  assert.ok(m.before.length < 100 && m.after.length < 200)
  // A match across lines shows its first line.
  const [r] = search.searchText('ab\ncd', 'b\\nc', { regex: true })
  assert.deepEqual([r.line, r.text, r.after], [1, 'b', ''])
})

// --- The list of files ----------------------------------------------------------------------

test('the file list skips tool and build folders, and can stop at a limit', async () => {
  const { files, truncated } = await ws.walkFiles(project)
  assert.deepEqual(files.map((f) => f.path).sort(), ['big.txt', 'logo.png', 'README.md', 'src/main.js', 'src/util.js'].sort())
  assert.equal(truncated, false)
  const few = await ws.walkFiles(project, { limit: 2 })
  assert.equal(few.files.length, 2)
  assert.equal(few.truncated, true)
})

test('the list is made once per folder, and again after a refresh or a new file', async () => {
  const a = await ws.ensureIndex(w.id)
  assert.equal(a.ready, true)
  assert.equal(await ws.ensureIndex(w.id), a)
  ws.forgetListings(w.id)
  const b = await ws.ensureIndex(w.id)
  assert.notEqual(b, a)
  await ws.createEntry(w.id, project, '', 'new.js', 'file')
  const c = await ws.ensureIndex(w.id)
  assert.ok(c.files.some((f) => f.path === 'new.js'))
})

// --- Searching everything ---------------------------------------------------------------------

test('search finds matches in documents and in folder files, skipping big and binary files', async () => {
  const note = store.createDoc('notes.txt', 'hello world', { autoName: false })
  const found = []
  const s = await search.searchAll('hello', {}, { onResult: (r) => found.push(r) })
  const paths = found.map((r) => r.target.path).sort()
  assert.deepEqual(paths, ['app/README.md', 'app/src/main.js', 'notes.txt'])
  assert.equal(found.find((r) => r.target.kind === 'doc').target.doc.id, note.id)
  assert.equal(found.find((r) => r.target.path === 'app/src/main.js').matches.length, 2)
  assert.deepEqual([s.files, s.matches, s.skipped], [3, 4, 2]) // big.txt and logo.png
})

test('a folder file opened as a document is searched as the document, with its edits', async () => {
  const handle = await (await project.getDirectoryHandle('src')).getFileHandle('util.js')
  const { doc } = await ws.openWorkspaceFile(w.id, 'src/util.js', handle)
  store.updateDoc(doc.id, { content: 'hello, edited' })
  const found = []
  await search.searchAll('hello', {}, { scope: 'folders', onResult: (r) => found.push(r) })
  const util = found.filter((r) => r.target.path.endsWith('util.js'))
  assert.equal(util.length, 1)
  assert.equal(util[0].target.kind, 'doc')
})

test('scope and file filter narrow the search', async () => {
  store.createDoc('notes.txt', 'hello', { autoName: false })
  const names = async (opts) => {
    const out = []
    await search.searchAll('hello', {}, { ...opts, onResult: (r) => out.push(r.target.name) })
    return out.sort()
  }
  assert.deepEqual(await names({ scope: 'documents' }), ['notes.txt'])
  assert.deepEqual(await names({ scope: 'folders' }), ['README.md', 'main.js'])
  assert.deepEqual(await names({ files: '*.js' }), ['main.js'])
  assert.deepEqual(await names({ files: '!src/' }), ['README.md', 'notes.txt'])
})

test('search options and invalid patterns', async () => {
  const count = async (q, o) => (await search.searchAll(q, o, { scope: 'folders' })).matches
  assert.equal(await count('Hello', { matchCase: true }), 0)
  assert.equal(await count('hel', { wholeWord: true }), 0)
  assert.equal(await count('^hello', { regex: true }), 1)
  await assert.rejects(search.searchAll('(', { regex: true }), SyntaxError)
  assert.equal((await search.searchAll('', {})).matches, 0)
})

test('results stop at the limit, and a search can be stopped', async () => {
  store.createDoc('many.txt', 'a'.repeat(search.MAX_RESULTS + 50), { autoName: false })
  const s = await search.searchAll('a', {}, { scope: 'documents' })
  assert.equal(s.truncated, true)
  assert.equal(s.matches, search.MAX_RESULTS)
  const c = new AbortController()
  c.abort()
  assert.equal((await search.searchAll('a', {}, { signal: c.signal })).aborted, true)
})

// --- Replacing and saving ----------------------------------------------------------------------

test('replace across files changes documents only; Save all then writes the files', async () => {
  const note = store.createDoc('notes.txt', 'hello there', { autoName: false })
  const targets = []
  await search.searchAll('hello', {}, { onResult: (r) => targets.push(r.target) })
  const r = await search.replaceAll(targets, 'hello', {}, 'bye')
  assert.deepEqual([r.files, r.count], [3, 4])
  assert.equal(store.getDoc(note.id).content, 'bye there')
  // The folder files are documents now, changed but not yet saved to disk.
  const main = ws.findWorkspaceDoc(w.id, 'src/main.js')
  assert.equal(main.content, 'const bye = 1\nbye()\n')
  assert.equal(main.diskDirty, true)
  const mainFile = await (await project.getDirectoryHandle('src')).getFileHandle('main.js')
  assert.equal(mainFile.text(), 'const hello = 1\nhello()\n', 'disk untouched')
  // A version from before the replace is kept.
  const versions = await store.listVersions(main.id)
  assert.ok(versions.some((v) => v.kind === 'replace'))

  assert.equal(fa.unsavedToDisk().length, 2)
  prefs.finalNewline = true
  const saved = await fa.saveAllToFiles({ prepare: saveall.prepareForSave })
  assert.deepEqual([saved.saved, saved.cancelled, saved.failed], [2, 0, []])
  assert.equal(mainFile.text(), 'const bye = 1\nbye()\n')
  assert.equal((await project.getFileHandle('README.md')).text(), 'Say bye\n')
  assert.equal(fa.unsavedToDisk().length, 0)
})

test('replace uses the text as it is now, with regex groups', async () => {
  const doc = store.createDoc('a.txt', 'x=1', { autoName: false })
  const target = { kind: 'doc', doc }
  store.updateDoc(doc.id, { content: 'x=1 y=2' })
  const r = await search.replaceInTarget(target, '(\\w)=(\\d)', { regex: true }, '$2:$1')
  assert.equal(r.count, 2)
  assert.equal(store.getDoc(doc.id).content, '1:x 2:y')
  assert.equal((await search.replaceInTarget(target, 'zzz', {}, '')).count, 0)
})

test('whitespace fixes for documents not open in an editor; Markdown keeps trailing spaces', async () => {
  const { fixWhitespaceText } = await import('../src/textops.js')
  assert.equal(fixWhitespaceText('a  \nb', { trim: true, finalNewline: true }), 'a\nb\n')
  prefs.trimOnSave = true
  const md = store.createDoc('x.md', 'line  \n', { autoName: false })
  await saveall.prepareForSave(store.getDoc(md.id))
  assert.equal(store.getDoc(md.id).content, 'line  \n')
  const txt = store.createDoc('x.txt', 'line  \n', { autoName: false })
  await saveall.prepareForSave(store.getDoc(txt.id))
  assert.equal(store.getDoc(txt.id).content, 'line\n')
})

test('FakeFile is a usable stand-in (sanity check)', async () => {
  const f = new FakeFile('a.txt', 'x')
  assert.equal(await (await f.getFile()).text(), 'x')
})
