// Closing a folder, and opening it again (src/closing.js). See
// docs/files-and-drafts.md, "Closing a folder".
import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { FakeDir } from './fakefs.js'

let store, ws, closing, fa, live
before(async () => {
  globalThis.indexedDB = new IDBFactory()
  store = await import('../src/store.js')
  await store.useBackend()
  ws = await import('../src/workspace.js')
  closing = await import('../src/closing.js')
  fa = await import('../src/fileaccess.js')
  live = await import('../src/livereload.js')
  globalThis.showOpenFilePicker = async () => []
  globalThis.showSaveFilePicker = async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) }
})

let project
beforeEach(() => {
  project = new FakeDir('my-app', { 'README.md': '# My app\n', 'notes.txt': 'notes', src: { 'main.js': 'one\n' } })
  globalThis.showDirectoryPicker = async () => project
})

// Open the folder and edit README.md (unsaved). Returns { w, doc, handle }.
async function openAndEdit(text = '# My app, edited\n') {
  const w = await ws.openFolder()
  const handle = await project.getFileHandle('README.md')
  const { doc } = await ws.openWorkspaceFile(w.id, 'README.md', handle)
  store.updateDoc(doc.id, { content: text })
  return { w, doc, handle }
}

const cleanUp = async () => {
  for (const w of [...(await import('../src/prefs.js')).prefs.workspaces]) await ws.closeFolder(w.id)
  for (const d of [...store.state.docs]) await store.deleteDoc(d.id)
}

test('unsavedIn lists the folder’s files with unsaved changes, and only those', async () => {
  const { w, doc } = await openAndEdit()
  const clean = (await ws.openWorkspaceFile(w.id, 'notes.txt', await project.getFileHandle('notes.txt'))).doc
  store.createDoc('draft.txt', 'not a file')
  assert.deepEqual(closing.unsavedIn(w.id).map((d) => d.id), [doc.id])
  assert.ok(!closing.unsavedIn(w.id).some((d) => d.id === clean.id))
  await cleanUp()
})

test('Save all to disk writes the folder’s files; nothing is left, so it can close', async () => {
  const { w, handle } = await openAndEdit()
  const r = await closing.saveFolderFiles(w.id)
  assert.equal(r.saved, 1)
  assert.deepEqual(r.left, [])
  assert.equal(handle.text(), '# My app, edited\n')
  await cleanUp()
})

test('Save all to disk leaves a file it couldn’t save (changed on disk, answer no): the folder must stay open', async () => {
  const { w, handle, doc } = await openAndEdit()
  handle.write('# changed elsewhere\n')
  const r = await closing.saveFolderFiles(w.id, { confirm: () => false })
  assert.equal(r.saved, 0)
  assert.deepEqual(r.left.map((d) => d.id), [doc.id])
  assert.equal(handle.text(), '# changed elsewhere\n')
  await cleanUp()
})

test('Keep as drafts, then open the folder again: Put the edits back makes them files again', async () => {
  const { w, doc, handle } = await openAndEdit()
  assert.equal(await ws.closeFolder(w.id), 1)
  assert.equal(store.getDoc(doc.id).kind, 'draft')

  const again = await ws.openFolder()
  assert.notEqual(again.id, w.id)
  assert.deepEqual(closing.returning[again.id], [doc.id])
  const r = await closing.putBack(again.id)
  assert.deepEqual(r, { back: 1, changed: 0, missing: 0 })
  const d = store.getDoc(doc.id)
  assert.equal(d.kind, 'file')
  assert.deepEqual(d.source, { root: again.id, path: 'README.md' })
  assert.equal(d.origin, undefined)
  assert.equal(d.content, '# My app, edited\n', 'the edits are still there')
  assert.equal(d.diskDirty, true, 'and still unsaved')
  assert.equal(handle.text(), '# My app\n', 'the file is untouched')
  assert.equal(live.diskNotices[doc.id], undefined)
  assert.equal(closing.returning[again.id], undefined)
  assert.equal(ws.findWorkspaceDoc(again.id, 'README.md').id, doc.id)
  // Save writes them, without asking.
  assert.equal((await fa.saveDoc(store.getDoc(doc.id), { confirm: () => assert.fail('asked') })).result, 'saved')
  assert.equal(handle.text(), '# My app, edited\n')
  assert.equal(await ws.originHandle(w.id), null, 'the old folder is forgotten once nothing points to it')
  await cleanUp()
})

test('a file changed on disk meanwhile comes back with the “changed on disk” notice, and Save asks', async () => {
  const { w, doc, handle } = await openAndEdit()
  await ws.closeFolder(w.id)
  handle.write('# changed while closed\n')
  const again = await ws.openFolder()
  const r = await closing.putBack(again.id)
  assert.deepEqual(r, { back: 1, changed: 1, missing: 0 })
  assert.deepEqual(live.diskNotices[doc.id], { kind: 'changed' })
  assert.equal(store.getDoc(doc.id).content, '# My app, edited\n', 'nothing replaced')
  assert.equal((await fa.saveDoc(store.getDoc(doc.id), { confirm: () => false })).result, 'cancelled')
  assert.equal(handle.text(), '# changed while closed\n')
  delete live.diskNotices[doc.id]
  await cleanUp()
})

test('a file gone from the folder leaves its draft as a draft', async () => {
  const { w, doc } = await openAndEdit()
  await ws.closeFolder(w.id)
  project.children.delete('README.md')
  const again = await ws.openFolder()
  const r = await closing.putBack(again.id)
  assert.deepEqual(r, { back: 0, changed: 0, missing: 1 })
  const d = store.getDoc(doc.id)
  assert.equal(d.kind, 'draft')
  assert.equal(d.origin.missing, true)
  assert.equal(d.content, '# My app, edited\n')
  await cleanUp()
})

test('a draft whose text now matches the file has nothing unsaved after putting it back', async () => {
  const { w, doc, handle } = await openAndEdit('# same\n')
  await ws.closeFolder(w.id)
  handle.write('# same\n') // the same edit made elsewhere
  const again = await ws.openFolder()
  const r = await closing.putBack(again.id)
  assert.deepEqual(r, { back: 1, changed: 0, missing: 0 })
  assert.equal(store.getDoc(doc.id).diskDirty, false)
  await cleanUp()
})

test('another folder with the same name is not mistaken for it; drafts with no remembered folder match by name', async () => {
  const { w, doc } = await openAndEdit()
  await ws.closeFolder(w.id)
  // A different folder that happens to have the same name.
  project = new FakeDir('my-app', { 'README.md': 'other\n' })
  const other = await ws.openFolder()
  assert.equal(closing.returning[other.id], undefined)
  await ws.closeFolder(other.id)

  // A draft kept before folders were remembered (from the migration).
  store.setDocOptions(doc.id, { origin: { folder: 'my-app', path: 'README.md' } })
  const third = await ws.openFolder()
  assert.deepEqual(closing.returning[third.id], [doc.id])
  closing.dismissReturning(third.id)
  assert.equal(closing.returning[third.id], undefined, 'Not now')
  await cleanUp()
})

test('closing a folder with nothing unsaved remembers nothing', async () => {
  const w = await ws.openFolder()
  await ws.openWorkspaceFile(w.id, 'notes.txt', await project.getFileHandle('notes.txt'))
  assert.equal(await ws.closeFolder(w.id), 0)
  assert.equal(await ws.originHandle(w.id), null)
  await cleanUp()
})
