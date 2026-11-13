import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'

// Stand-ins for the File System Access API's handles, backed by memory.
class FakeFile {
  constructor(name, text = '') {
    this.kind = 'file'
    this.name = name
    this.write(text)
  }
  write(text) {
    this.bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text
    this.lastModified = (this.lastModified ?? 1000) + 1
  }
  async getFile() {
    return new File([this.bytes], this.name, { lastModified: this.lastModified })
  }
  async createWritable() {
    const chunks = []
    return {
      write: async (blob) => chunks.push(new Uint8Array(await blob.arrayBuffer())),
      close: async () => this.write(chunks[0]),
      abort: async () => {},
    }
  }
  async queryPermission() { return 'granted' }
  async isSameEntry(other) { return other === this }
  text() { return new TextDecoder().decode(this.bytes) }
}

const notFound = () => Object.assign(new Error('not found'), { name: 'NotFoundError' })
const mismatch = () => Object.assign(new Error('wrong kind'), { name: 'TypeMismatchError' })

class FakeDir {
  constructor(name, children = {}) {
    this.kind = 'directory'
    this.name = name
    this.children = new Map()
    for (const [n, c] of Object.entries(children)) {
      this.children.set(n, typeof c === 'string' || c instanceof Uint8Array ? new FakeFile(n, c) : new FakeDir(n, c))
    }
    this.permission = 'granted'
  }
  async *values() { yield* this.children.values() }
  async getFileHandle(name, { create = false } = {}) {
    const c = this.children.get(name)
    if (c?.kind === 'file') return c
    if (c) throw mismatch()
    if (!create) throw notFound()
    const f = new FakeFile(name)
    this.children.set(name, f)
    return f
  }
  async getDirectoryHandle(name, { create = false } = {}) {
    const c = this.children.get(name)
    if (c?.kind === 'directory') return c
    if (c) throw mismatch()
    if (!create) throw notFound()
    const d = new FakeDir(name)
    this.children.set(name, d)
    return d
  }
  async queryPermission() { return this.permission }
  async requestPermission() { return (this.permission = 'granted') }
  async isSameEntry(other) { return other === this }
}

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
