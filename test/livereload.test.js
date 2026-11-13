import { test, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { FakeDir, FakeFile } from './fakefs.js'

// A stand-in for FileSystemObserver: tests send it change records.
const observers = []
class FakeObserver {
  constructor(callback) {
    this.callback = callback
    observers.push(this)
  }
  async observe() {}
  disconnect() {}
  send(type, path, from) {
    this.callback([{ type, relativePathComponents: path.split('/'), relativePathMovedFrom: from?.split('/') }])
  }
}
const settle = () => new Promise((r) => setTimeout(r, 250)) // past the 150 ms pause

let store, ws, live, fa, prefs
before(async () => {
  globalThis.indexedDB = new IDBFactory()
  store = await import('../src/store.js')
  await store.useBackend()
  ws = await import('../src/workspace.js')
  live = await import('../src/livereload.js')
  fa = await import('../src/fileaccess.js')
  ;({ prefs } = await import('../src/prefs.js'))
  live.startLiveReload()
  globalThis.showOpenFilePicker = async () => []
  globalThis.showSaveFilePicker = async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) }
})

let project, w, reloaded, file, doc
beforeEach(async () => {
  globalThis.FileSystemObserver = FakeObserver
  project = new FakeDir('app', { src: { 'a.js': 'one' } })
  globalThis.showDirectoryPicker = async () => project
  w = await ws.openFolder()
  await new Promise((r) => setTimeout(r, 0))
  reloaded = []
  live.setReloadedHandler((d) => reloaded.push(d.id))
  file = await (await project.getDirectoryHandle('src')).getFileHandle('a.js')
  ;({ doc } = await ws.openWorkspaceFile(w.id, 'src/a.js', file))
})
afterEach(async () => {
  await ws.closeFolder(w.id)
  for (const id of Object.keys(live.diskNotices)) delete live.diskNotices[id]
  prefs.liveReload = true
})
const observer = () => observers.at(-1)
const current = () => store.getDoc(doc.id)

test('a file changed on disk reloads its document, keeping the old text as a version', async () => {
  file.write('two')
  observer().send('modified', 'src/a.js')
  await settle()
  assert.equal(current().content, 'two')
  assert.equal(current().diskDirty, false)
  assert.deepEqual(reloaded, [doc.id])
  const versions = await store.listVersions(doc.id)
  const texts = await Promise.all(versions.map((v) => store.versionText(v.id)))
  assert.ok(texts.includes('one'))
})

test('a burst of changes is checked once things settle', async () => {
  file.write('t1')
  observer().send('modified', 'src/a.js')
  file.write('t2')
  observer().send('modified', 'src/a.js')
  await settle()
  assert.equal(current().content, 't2')
  assert.equal(reloaded.length, 1)
})

test('unsaved changes are never replaced: a notice offers to reload or keep them', async () => {
  store.updateDoc(doc.id, { content: 'mine' })
  file.write('theirs')
  observer().send('modified', 'src/a.js')
  await settle()
  assert.equal(current().content, 'mine')
  assert.deepEqual(live.diskNotices[doc.id], { kind: 'changed' })
  live.keepMine(doc.id)
  assert.equal(live.diskNotices[doc.id], undefined)
  // Asked again on the next change; this time take the file's text.
  file.write('theirs, again')
  observer().send('modified', 'src/a.js')
  await settle()
  assert.equal(await live.reloadFromDisk(doc.id), true)
  assert.equal(current().content, 'theirs, again')
  assert.equal(current().diskDirty, false)
  assert.equal(live.diskNotices[doc.id], undefined)
  const versions = await store.listVersions(doc.id)
  const kept = versions.find((v) => v.label === 'Before reloading from disk')
  assert.equal(await store.versionText(kept.id), 'mine')
})

test('our own save is not a change on disk', async () => {
  store.updateDoc(doc.id, { content: 'saved here' })
  const saving = fa.saveDoc(current())
  observer().send('modified', 'src/a.js') // reported while writing
  await saving
  await settle()
  assert.equal(live.diskNotices[doc.id], undefined)
  assert.equal(current().content, 'saved here')
  assert.equal(current().diskDirty, false)
  assert.deepEqual(reloaded, [])
})

test('the same text written elsewhere just marks the document saved', async () => {
  store.updateDoc(doc.id, { content: 'agreed' })
  assert.equal(current().diskDirty, true)
  file.write('agreed')
  observer().send('modified', 'src/a.js')
  await settle()
  assert.equal(current().diskDirty, false)
  assert.equal(live.diskNotices[doc.id], undefined)
})

test('a deleted file gets a notice; the text stays', async () => {
  file.missing = true
  observer().send('disappeared', 'src/a.js')
  assert.deepEqual(live.diskNotices[doc.id], { kind: 'deleted' })
  assert.equal(current().content, 'one')
  // It comes back (git checkout): checking clears the notice.
  file.missing = false
  assert.equal(await live.checkDoc(doc.id), 'same')
  assert.equal(live.diskNotices[doc.id], undefined)
})

test('a file moved or renamed in the folder takes its document along', async () => {
  const src = await project.getDirectoryHandle('src')
  const lib = await project.getDirectoryHandle('lib', { create: true })
  const moved = await lib.getFileHandle('b.js', { create: true })
  moved.write('one')
  src.children.delete('a.js')
  observer().send('moved', 'lib/b.js', 'src/a.js')
  await settle()
  await settle()
  assert.deepEqual(current().source, { root: w.id, path: 'lib/b.js' })
  assert.equal(current().name, 'b.js')
  assert.equal(current().folder, 'app/lib')
  assert.equal(live.diskNotices[doc.id], undefined)
  // Save now writes to the new place.
  store.updateDoc(doc.id, { content: 'after the move' })
  assert.equal((await fa.saveDoc(current())).result, 'saved')
  assert.equal(moved.text(), 'after the move')
})

test('with live reload off, a change only raises a notice', async () => {
  prefs.liveReload = false
  file.write('two')
  observer().send('modified', 'src/a.js')
  await settle()
  assert.equal(current().content, 'one')
  assert.deepEqual(live.diskNotices[doc.id], { kind: 'changed' })
})

test('files opened on their own are checked when the window comes back', async () => {
  const single = new FakeFile('notes.txt', 'v1')
  const d = await store.importFile(await single.getFile(), single)
  prefs.tabs = [d.id]
  single.write('v2')
  await live.checkOpenDocs({ now: Date.now() + 5000 })
  assert.equal(store.getDoc(d.id).content, 'v2')
  // Not more than once a second.
  single.write('v3')
  await live.checkOpenDocs({ now: Date.now() + 5100 })
  assert.equal(store.getDoc(d.id).content, 'v2')
})
