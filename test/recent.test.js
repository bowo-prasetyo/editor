// Files opened on their own: Recent files (src/recent.js), saving a draft
// to a file, and migration step 3. See docs/files-and-drafts.md.
import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { FakeDir, FakeFile } from './fakefs.js'

let store, recent, fa, ws, migrate
before(async () => {
  globalThis.indexedDB = new IDBFactory()
  store = await import('../src/store.js')
  await store.useBackend()
  recent = await import('../src/recent.js')
  fa = await import('../src/fileaccess.js')
  ws = await import('../src/workspace.js')
  migrate = await import('../src/migrate.js')
  globalThis.showOpenFilePicker = async () => []
})
beforeEach(async () => {
  for (const d of [...store.state.docs]) await store.deleteDoc(d.id)
})

const open = async (handle) => recent.openSingleFile(await handle.getFile(), handle)

test('a file opened on its own is a file in Recent files, not a draft', async () => {
  const h = new FakeFile('notes.txt', 'hello')
  const doc = await open(h)
  assert.equal(doc.kind, 'file')
  assert.equal(doc.source, undefined)
  assert.equal(doc.linked, true)
  assert.equal(doc.content, 'hello')
  assert.deepEqual(recent.recentFiles().map((d) => d.id), [doc.id])
})

test('opening the same file again shows the same record, with the file’s current text', async () => {
  const h = new FakeFile('notes.txt', 'one')
  const first = await open(h)
  h.write('two')
  const again = await open(h)
  assert.equal(again.id, first.id)
  assert.equal(again.content, 'two')
  assert.equal(recent.recentFiles().length, 1)
  // Another file with the same name is another record.
  const other = await open(new FakeFile('notes.txt', 'other'))
  assert.notEqual(other.id, first.id)
})

test('a recent file not read yet gets its text when opened again', async () => {
  const h = new FakeFile('a.txt', 'disk text')
  const doc = await open(h)
  Object.assign(store.getDoc(doc.id), { content: '', unread: true })
  const again = await open(h)
  assert.equal(again.content, 'disk text')
  assert.equal(again.unread, undefined)
})

test('the list keeps the 20 most recent; a file with unsaved changes never drops out', async () => {
  const first = await open(new FakeFile('first.txt', 'f'))
  store.updateDoc(first.id, { content: 'unsaved' })
  store.setDocOptions(first.id, { openedAt: 1 }) // the oldest
  const second = await open(new FakeFile('second.txt', 's'))
  store.setDocOptions(second.id, { openedAt: 2 })
  for (let i = 0; i < 20; i++) await open(new FakeFile(`n${i}.txt`, String(i)))
  const ids = recent.recentFiles().map((d) => d.id)
  assert.ok(ids.includes(first.id), 'unsaved changes keep it')
  assert.ok(!ids.includes(second.id), 'the oldest with nothing unsaved went')
  assert.equal(store.getDoc(second.id), undefined)
  assert.equal(ids.length, 21)
})

test('a file can be taken off the list, unless it has unsaved changes', async () => {
  const a = await open(new FakeFile('a.txt', 'a'))
  assert.equal(await recent.forgetRecentFile(a.id), true)
  assert.equal(store.getDoc(a.id), undefined)
  const b = await open(new FakeFile('b.txt', 'b'))
  store.updateDoc(b.id, { content: 'edited' })
  assert.equal(await recent.forgetRecentFile(b.id), false)
  assert.ok(store.getDoc(b.id))
})

test('a draft saved to a file becomes that file, in Recent files', async () => {
  const target = new FakeFile('saved.md', '')
  globalThis.showSaveFilePicker = async () => target
  const d = store.createDoc('draft.md', 'my text', { autoName: false })
  store.setDocOptions(d.id, { pinned: true, folder: 'Ideas' })
  assert.equal((await fa.saveDoc(store.getDoc(d.id))).result, 'saved')
  const f = store.getDoc(d.id)
  assert.equal(f.kind, 'file')
  assert.equal(f.folder, undefined)
  assert.equal(f.pinned, undefined)
  assert.equal(target.text(), 'my text')
  assert.ok(recent.recentFiles().some((x) => x.id === d.id))
})

test('a folder’s file saved as another file is that file, outside the folder', async () => {
  const project = new FakeDir('my-app', { 'a.txt': 'a' })
  globalThis.showDirectoryPicker = async () => project
  const w = await ws.openFolder()
  const { doc } = await ws.openWorkspaceFile(w.id, 'a.txt', await project.getFileHandle('a.txt'))
  const copy = new FakeFile('copy.txt', '')
  globalThis.showSaveFilePicker = async () => copy
  assert.equal((await fa.saveDoc(store.getDoc(doc.id), { saveAs: true })).result, 'saved')
  const f = store.getDoc(doc.id)
  assert.equal(f.source, undefined)
  assert.equal(ws.findWorkspaceDoc(w.id, 'a.txt'), undefined)
  assert.ok(recent.recentFiles().some((x) => x.id === doc.id))
  await ws.closeFolder(w.id)
})

test('migration step 3: single files kept as drafts become recent files; old ones are offered as copies', () => {
  const d = (id, extra) => ({ id, kind: 'draft', name: id + '.txt', content: 'x', linked: true, ...extra })
  const docs = [
    ...Array.from({ length: 22 }, (_, i) => d(`f${i}`, { updatedAt: 100 - i })),
    d('old-dirty', { updatedAt: 1, diskDirty: true }),
    d('kept', { updatedAt: 200, origin: { folder: 'app', path: 'a' } }), // from a closed folder: stays
    d('plain', { linked: false, updatedAt: 300 }), // not a file
    d('trashed', { updatedAt: 300, deletedAt: 1 }),
  ]
  const out = Object.fromEntries(migrate.singleFiles(docs))
  for (let i = 0; i < 20; i++) assert.equal(out[`f${i}`].kind, 'file', `f${i}`)
  assert.deepEqual(out.f20, { copyOf: { folder: '', path: 'f20.txt' } })
  assert.deepEqual(out.f21, { copyOf: { folder: '', path: 'f21.txt' } })
  assert.equal(out['old-dirty'].kind, 'file', 'unsaved changes are never left as a copy')
  assert.equal(out.kept, undefined)
  assert.equal(out.plain, undefined)
  assert.equal(out.trashed, undefined)
  assert.equal(out.f0.openedAt, 100)
})
