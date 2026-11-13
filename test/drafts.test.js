// Drafts: pinning and "Save to folder…" (src/drafts.js). See
// docs/files-and-drafts.md, "Drafts".
import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { FakeDir } from './fakefs.js'

let store, ws, drafts, prefs
before(async () => {
  globalThis.indexedDB = new IDBFactory()
  store = await import('../src/store.js')
  await store.useBackend()
  ws = await import('../src/workspace.js')
  drafts = await import('../src/drafts.js')
  ;({ prefs } = await import('../src/prefs.js'))
})

let project, w
beforeEach(async () => {
  for (const x of [...prefs.workspaces]) await ws.closeFolder(x.id)
  project = new FakeDir('my-app', { 'README.md': '# My app\n', notes: { 'old.md': 'old' } })
  globalThis.showDirectoryPicker = async () => project
  w = await ws.openFolder()
})

const text = (f) => new TextDecoder().decode(f.bytes)

test('pinning is a setting, not an edit', async () => {
  const d = store.createDoc('a.txt', 'a')
  const edited = d.updatedAt
  drafts.togglePin(d.id)
  assert.equal(store.getDoc(d.id).pinned, true)
  assert.equal(store.getDoc(d.id).updatedAt, edited)
  drafts.togglePin(d.id)
  assert.equal(store.getDoc(d.id).pinned, undefined)
})

test('open folders are offered as places to save a draft', () => {
  assert.deepEqual(drafts.saveTargets(), [{ id: w.id, name: 'my-app' }])
})

test('Save to folder writes the file, in the draft’s encoding and line endings, and makes the draft that file', async () => {
  const d = store.createDoc('todo.txt', 'one\ntwo', { autoName: false, eol: '\r\n' })
  store.setDocOptions(d.id, { pinned: true, folder: 'Work' })
  const saved = await drafts.saveDraftToFolder(d.id, w.id, 'plans/todo.txt')
  const file = (await project.getDirectoryHandle('plans')).children.get('todo.txt')
  assert.equal(text(file), 'one\r\ntwo')
  const f = store.getDoc(d.id)
  assert.equal(f.kind, 'file')
  assert.deepEqual(f.source, { root: w.id, path: 'plans/todo.txt' })
  assert.equal(f.folder, 'my-app/plans')
  assert.equal(f.linked, true)
  assert.equal(f.diskDirty, false)
  assert.equal(f.pinned, undefined, 'files aren’t pinned')
  assert.equal(ws.findWorkspaceDoc(w.id, 'plans/todo.txt').id, d.id)
  const versions = await store.listVersions(d.id)
  assert.ok(versions.some((v) => v.kind === 'saved'), 'its history goes with it')
  assert.equal(saved.path, 'plans/todo.txt')
})

test('Save to folder never replaces a file, or a folder', async () => {
  const d = store.createDoc('README.md', 'mine', { autoName: false })
  await assert.rejects(drafts.saveDraftToFolder(d.id, w.id, 'README.md'), /already exists in “my-app”/)
  await assert.rejects(drafts.saveDraftToFolder(d.id, w.id, 'notes'), /is a folder/)
  assert.equal(text(project.children.get('README.md')), '# My app\n')
  assert.equal(store.getDoc(d.id).kind, 'draft')
})

test('Save to folder refuses names that aren’t file names', async () => {
  const d = store.createDoc('x.txt', 'x', { autoName: false })
  await assert.rejects(drafts.saveDraftToFolder(d.id, w.id, '  '), /Type a file name/)
  await assert.rejects(drafts.saveDraftToFolder(d.id, w.id, '../x.txt'), /can’t be/)
  assert.deepEqual(drafts.splitPath(' notes / a.md '), ['notes', 'a.md'])
  assert.deepEqual(drafts.splitPath('notes\\a.md'), ['notes', 'a.md'])
})

test('only drafts can be saved to a folder', async () => {
  const { doc } = await ws.openWorkspaceFile(w.id, 'README.md', await project.getFileHandle('README.md'))
  await assert.rejects(drafts.saveDraftToFolder(doc.id, w.id, 'copy.md'), /Only a draft/)
})

test('Undo makes it a draft again and removes the file, if it’s still what was written', async () => {
  const d = store.createDoc('note.md', 'hello', { autoName: false })
  store.setDocOptions(d.id, { pinned: true, folder: 'Ideas' })
  const saved = await drafts.saveDraftToFolder(d.id, w.id, 'note.md')
  assert.equal(await drafts.undoSaveToFolder(saved), true)
  const back = store.getDoc(d.id)
  assert.equal(back.kind, 'draft')
  assert.equal(back.source, undefined)
  assert.equal(back.linked, false)
  assert.equal(back.pinned, true)
  assert.equal(back.folder, 'Ideas')
  assert.equal(back.content, 'hello')
  assert.equal(project.children.has('note.md'), false)
})

test('Undo keeps the file if it changed since it was written', async () => {
  const d = store.createDoc('note.md', 'hello', { autoName: false })
  const saved = await drafts.saveDraftToFolder(d.id, w.id, 'note.md')
  project.children.get('note.md').write('changed by someone')
  assert.equal(await drafts.undoSaveToFolder(saved), false)
  assert.equal(store.getDoc(d.id).kind, 'draft')
  assert.equal(text(project.children.get('note.md')), 'changed by someone')
})
