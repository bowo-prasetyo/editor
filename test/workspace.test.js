import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'

import { FakeDir } from './fakefs.js'

let store, ws, prefs, fa
before(async () => {
  globalThis.indexedDB = new IDBFactory()
  store = await import('../src/store.js')
  await store.useBackend()
  ws = await import('../src/workspace.js')
  ;({ prefs } = await import('../src/prefs.js'))
  fa = await import('../src/fileaccess.js')
})

let project
beforeEach(() => {
  project = new FakeDir('my-app', {
    'README.md': '# My app\n',
    'file10.txt': 'ten',
    'file2.txt': 'two',
    src: { 'main.js': 'console.log(1)\n', components: { 'Button.vue': '<template/>' } },
    'logo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 1, 2, 3]),
  })
  globalThis.showDirectoryPicker = async () => project
})

async function openProject() {
  const w = await ws.openFolder()
  return { w, root: ws.roots.get(w.id) }
}

test('opening a folder adds it to the sidebar once', async () => {
  const { w, root } = await openProject()
  assert.equal(w.name, 'my-app')
  assert.equal(root.permission, 'granted')
  assert.equal(prefs.sidebar, true)
  const again = await ws.openFolder()
  assert.equal(again.id, w.id)
  assert.equal(prefs.workspaces.filter((x) => x.name === 'my-app').length, 1)
  await ws.closeFolder(w.id)
})

test('cancelling the picker opens nothing', async () => {
  globalThis.showDirectoryPicker = async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) }
  assert.equal(await ws.openFolder(), null)
})

test('listings put folders first, then files in natural order', async () => {
  const { w } = await openProject()
  const list = await ws.loadListing(w.id, '', project)
  assert.deepEqual(list.map((e) => e.name), ['src', 'file2.txt', 'file10.txt', 'logo.png', 'README.md'])
  assert.equal(ws.getListing(w.id, ''), list)
  ws.forgetListings(w.id)
  assert.equal(ws.getListing(w.id, ''), undefined)
  await ws.closeFolder(w.id)
})

test('expanding a folder remembers it; collapsing also collapses what is inside', async () => {
  const { w } = await openProject()
  assert.equal(ws.isExpanded(w.id, ''), true)
  ws.setExpanded(w.id, 'src', true)
  ws.setExpanded(w.id, 'src/components', true)
  assert.equal(ws.isExpanded(w.id, 'src/components'), true)
  ws.setExpanded(w.id, 'src', false)
  assert.equal(ws.isExpanded(w.id, 'src'), false)
  assert.equal(ws.isExpanded(w.id, 'src/components'), false)
  await ws.closeFolder(w.id)
  assert.equal(prefs.expanded[w.id], undefined)
})

test('opening a file makes a linked document filed under the folder path; opening it again finds it', async () => {
  const { w } = await openProject()
  const src = await project.getDirectoryHandle('src')
  const comps = await src.getDirectoryHandle('components')
  const handle = await comps.getFileHandle('Button.vue')
  const { doc } = await ws.openWorkspaceFile(w.id, 'src/components/Button.vue', handle)
  assert.equal(doc.content, '<template/>')
  assert.equal(doc.linked, true)
  assert.equal(doc.folder, 'my-app/src/components')
  assert.deepEqual(doc.source, { root: w.id, path: 'src/components/Button.vue' })
  const again = await ws.openWorkspaceFile(w.id, 'src/components/Button.vue', handle)
  assert.equal(again.doc.id, doc.id)
  assert.equal(again.refreshed, 'same')
  await ws.closeFolder(w.id)
})

test('saving writes back to the file in the folder', async () => {
  globalThis.showOpenFilePicker = async () => []
  globalThis.showSaveFilePicker = async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) }
  const { w } = await openProject()
  const handle = await project.getFileHandle('README.md')
  const { doc } = await ws.openWorkspaceFile(w.id, 'README.md', handle)
  store.updateDoc(doc.id, { content: '# Renamed\n' })
  const r = await fa.saveDoc(store.getDoc(doc.id))
  assert.equal(r.result, 'saved')
  assert.equal(handle.text(), '# Renamed\n')
  assert.equal(store.getDoc(doc.id).diskDirty, false)
  await ws.closeFolder(w.id)
})

test('a file changed on disk is reloaded when opened again, unless the document has unsaved changes', async () => {
  const { w } = await openProject()
  const handle = await project.getFileHandle('file2.txt')
  const { doc } = await ws.openWorkspaceFile(w.id, 'file2.txt', handle)
  handle.write('two, edited elsewhere')
  const r = await ws.openWorkspaceFile(w.id, 'file2.txt', handle)
  assert.equal(r.refreshed, 'reloaded')
  assert.equal(store.getDoc(doc.id).content, 'two, edited elsewhere')
  assert.equal(store.getDoc(doc.id).diskDirty, false)

  store.updateDoc(doc.id, { content: 'my edit' })
  handle.write('their edit')
  const c = await ws.openWorkspaceFile(w.id, 'file2.txt', handle)
  assert.equal(c.refreshed, 'conflict')
  assert.equal(store.getDoc(doc.id).content, 'my edit')
  await ws.closeFolder(w.id)
})

test('binary files are refused', async () => {
  const { w } = await openProject()
  const handle = await project.getFileHandle('logo.png')
  await assert.rejects(ws.openWorkspaceFile(w.id, 'logo.png', handle), { name: 'BinaryFileError' })
  await ws.closeFolder(w.id)
})

test('new files and folders are created, never replacing what is there', async () => {
  const { w } = await openProject()
  const src = await project.getDirectoryHandle('src')
  const f = await ws.createEntry(w.id, src, 'src', ' util.js ', 'file')
  assert.equal(f.name, 'util.js')
  assert.ok(ws.getListing(w.id, 'src').some((e) => e.name === 'util.js'))
  const d = await ws.createEntry(w.id, src, 'src', 'lib', 'directory')
  assert.equal(d.kind, 'directory')
  await assert.rejects(ws.createEntry(w.id, src, 'src', 'main.js', 'file'), /already exists/)
  await assert.rejects(ws.createEntry(w.id, src, 'src', 'lib', 'file'), /already exists/)
  await assert.rejects(ws.createEntry(w.id, src, 'src', '../x', 'file'), /can’t/)
  assert.equal(ws.checkEntryName(''), 'Type a name.')
  await ws.closeFolder(w.id)
})

test('a folder that needs permission again can be reconnected', async () => {
  const { w, root } = await openProject()
  project.permission = 'prompt'
  root.permission = 'prompt'
  assert.equal(await ws.reconnect(w.id), true)
  assert.equal(root.permission, 'granted')
  await ws.closeFolder(w.id)
})

test('after a reload, open folders are found again from storage', async () => {
  const { w } = await openProject()
  ws.roots.clear() // as on a fresh page
  await ws.loadWorkspaces()
  const root = ws.roots.get(w.id)
  assert.ok(root, 'the folder is back')
  assert.equal(root.handle.name, 'my-app')
  await ws.closeFolder(w.id)
  ws.roots.clear()
  await ws.loadWorkspaces()
  assert.equal(ws.roots.has(w.id), false, 'a closed folder stays closed')
})

test('paths and folders for the document list', () => {
  assert.equal(ws.joinPath('', 'a.js'), 'a.js')
  assert.equal(ws.joinPath('src', 'a.js'), 'src/a.js')
  assert.equal(ws.docFolder('app', 'a.js'), 'app')
  assert.equal(ws.docFolder('app', 'src/x/a.js'), 'app/src/x')
})

// --- Files and drafts (docs/files-and-drafts.md) ------------------------------------

test('a file opened from a folder is a file, not a draft', async () => {
  const { w } = await openProject()
  const { doc } = await ws.openWorkspaceFile(w.id, 'file2.txt', await project.getFileHandle('file2.txt'))
  assert.equal(doc.kind, 'file')
  assert.equal(store.isFile(doc), true)
  assert.equal(store.createDoc().kind, 'draft')
  await ws.closeFolder(w.id)
})

test('a file not read yet gets its text from disk, fresh, when shown', async () => {
  const { w } = await openProject()
  const handle = await project.getFileHandle('file10.txt')
  const { doc } = await ws.openWorkspaceFile(w.id, 'file10.txt', handle)
  // As loaded after a reload: stored without its text.
  Object.assign(store.getDoc(doc.id), { content: '', unread: true })
  handle.write('ten, changed while Plumb was closed')
  assert.equal(await ws.readFileText(doc.id), 'ready')
  const d = store.getDoc(doc.id)
  assert.equal(d.content, 'ten, changed while Plumb was closed')
  assert.equal(d.unread, undefined)
  assert.equal(d.diskDirty, false, 'reading is not an edit')
  assert.equal(await ws.readFileText(doc.id), 'ready', 'nothing to do once read')
  await ws.closeFolder(w.id)
})

test('reading a file’s text needs the folder’s permission, and says when it’s gone', async () => {
  const { w } = await openProject()
  const handle = await project.getFileHandle('README.md')
  const { doc } = await ws.openWorkspaceFile(w.id, 'README.md', handle)
  Object.assign(store.getDoc(doc.id), { content: '', unread: true })
  handle.queryPermission = async () => 'prompt'
  assert.equal(await ws.readFileText(doc.id), 'needs-access')
  assert.equal(store.getDoc(doc.id).unread, true)
  handle.queryPermission = async () => 'granted'
  handle.getFile = async () => { throw Object.assign(new Error('gone'), { name: 'NotFoundError' }) }
  assert.equal(await ws.readFileText(doc.id), 'missing')
  delete handle.getFile
  await ws.closeFolder(w.id)
})

test('a file not read yet is never written: its placeholder would wipe the file', async () => {
  const { w } = await openProject()
  const handle = await project.getFileHandle('file2.txt')
  const { doc } = await ws.openWorkspaceFile(w.id, 'file2.txt', handle)
  Object.assign(store.getDoc(doc.id), { content: '', unread: true })
  await assert.rejects(fa.saveDoc(store.getDoc(doc.id)), /hasn’t been read/)
  assert.equal(handle.text(), 'two')
  await ws.closeFolder(w.id)
})

test('opening a file not read yet reads it', async () => {
  const { w } = await openProject()
  const handle = await project.getFileHandle('file2.txt')
  const { doc } = await ws.openWorkspaceFile(w.id, 'file2.txt', handle)
  Object.assign(store.getDoc(doc.id), { content: '', unread: true })
  const again = await ws.openWorkspaceFile(w.id, 'file2.txt', handle)
  assert.equal(again.doc.id, doc.id)
  assert.equal(store.getDoc(doc.id).content, 'two')
  await ws.closeFolder(w.id)
})

test('closing a folder keeps files with unsaved changes as drafts and lets the others go', async () => {
  const { w } = await openProject()
  const clean = (await ws.openWorkspaceFile(w.id, 'file10.txt', await project.getFileHandle('file10.txt'))).doc
  const edited = (await ws.openWorkspaceFile(w.id, 'README.md', await project.getFileHandle('README.md'))).doc
  store.updateDoc(edited.id, { content: '# My app, edited\n' })
  assert.equal(await ws.closeFolder(w.id), 1)

  assert.equal(store.getDoc(clean.id), undefined, 'its text is on disk')
  assert.deepEqual(await store.listVersions(clean.id), [], 'its history goes with it')
  const kept = store.getDoc(edited.id)
  assert.equal(kept.kind, 'draft')
  assert.equal(kept.content, '# My app, edited\n')
  assert.deepEqual(kept.origin, { folder: 'my-app', path: 'README.md' })
  assert.equal(kept.source, undefined)
  store.deleteDoc(edited.id)
})
