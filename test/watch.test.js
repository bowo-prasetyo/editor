import { test, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { FakeDir } from './fakefs.js'

// A stand-in for FileSystemObserver: tests send it change records.
const observers = []
class FakeObserver {
  constructor(callback) {
    this.callback = callback
    this.disconnected = false
    observers.push(this)
  }
  async observe(handle, options) {
    this.handle = handle
    this.options = options
  }
  disconnect() {
    this.disconnected = true
  }
  send(...records) {
    this.callback(records.map(([type, path, from]) => ({
      type,
      relativePathComponents: path ? path.split('/') : [],
      relativePathMovedFrom: from ? from.split('/') : undefined,
    })))
  }
}

let ws, cache, search
before(async () => {
  globalThis.indexedDB = new IDBFactory()
  const store = await import('../src/store.js')
  await store.useBackend()
  ws = await import('../src/workspace.js')
  cache = await import('../src/filecache.js')
  search = await import('../src/search.js')
})

let project, w
const latest = () => observers.at(-1)
beforeEach(async () => {
  globalThis.FileSystemObserver = FakeObserver
  project = new FakeDir('app', {
    src: { 'a.js': 'needle one', 'b.js': 'nothing' },
    node_modules: { dep: { 'x.js': 'needle' } },
  })
  globalThis.showDirectoryPicker = async () => project
  w = await ws.openFolder()
  await new Promise((r) => setTimeout(r, 0)) // let observe() finish
})
afterEach(async () => {
  await ws.closeFolder(w.id)
  delete globalThis.FileSystemObserver
})

test('an open folder is watched, recursively; closing it stops that', async () => {
  const o = latest()
  assert.equal(o.handle, project)
  assert.deepEqual(o.options, { recursive: true })
  assert.equal(typeof ws.trustSince(w.id), 'number')
  await ws.closeFolder(w.id)
  assert.equal(o.disconnected, true)
  assert.equal(ws.trustSince(w.id), null)
  w = await ws.openFolder() // for afterEach
})

test('without FileSystemObserver nothing is trusted (files are checked instead)', async () => {
  await ws.closeFolder(w.id)
  delete globalThis.FileSystemObserver
  w = await ws.openFolder()
  assert.equal(ws.trustSince(w.id), null)
})

test('search reads each file once while the folder is watched', async () => {
  const a = await (await project.getDirectoryHandle('src')).getFileHandle('a.js')
  let reads = 0
  const getFile = a.getFile.bind(a)
  a.getFile = async () => (reads++, getFile())
  assert.equal((await search.searchAll('needle', {}, { scope: 'folders' })).matches, 1)
  assert.equal((await search.searchAll('needle', {}, { scope: 'folders' })).matches, 1)
  assert.equal(reads, 1)
  // A change on disk is reported: the next search reads it again.
  a.write('needle needle')
  latest().send(['modified', 'src/a.js'])
  assert.equal((await search.searchAll('needle', {}, { scope: 'folders' })).matches, 2)
  assert.equal(reads, 2)
})

test('files added or removed make the list of files again and refresh folders shown in the tree', async () => {
  const src = await project.getDirectoryHandle('src')
  await ws.ensureIndex(w.id)
  await ws.loadListing(w.id, 'src', src)
  await src.getFileHandle('c.js', { create: true })
  latest().send(['appeared', 'src/c.js'])
  assert.equal(ws.fileIndex.get(w.id), undefined, 'list forgotten')
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(ws.getListing(w.id, 'src').some((e) => e.name === 'c.js'), 'tree refreshed')
  const index = await ws.ensureIndex(w.id)
  assert.ok(index.files.some((f) => f.path === 'src/c.js'))
})

test('changes in tool folders and saves through swap files keep the list of files', async () => {
  const index = await ws.ensureIndex(w.id)
  latest().send(['appeared', 'node_modules/dep/y.js'])
  assert.equal(ws.fileIndex.get(w.id), index)
  latest().send(['appeared', 'src/a.js.crswap'], ['moved', 'src/a.js', 'src/a.js.crswap'])
  assert.equal(ws.fileIndex.get(w.id), index)
})

test('a moved file drops both its old and new place from the cache', async () => {
  await search.searchAll('needle', {}, { scope: 'folders' })
  assert.equal(cache.isCached(`${w.id}:src/a.js`), true)
  latest().send(['moved', 'src/z.js', 'src/a.js'])
  assert.equal(cache.isCached(`${w.id}:src/a.js`), false)
})

test('if the browser stops watching, everything kept is dropped and the folder is watched again', async () => {
  await search.searchAll('needle', {}, { scope: 'folders' })
  const before = latest()
  before.send(['errored', ''])
  assert.equal(cache.cacheSize().files, 0)
  await new Promise((r) => setTimeout(r, 0))
  assert.notEqual(latest(), before)
  assert.equal(typeof ws.trustSince(w.id), 'number')
})

test('the background read fills the cache with the folder’s files', async () => {
  const r = await search.warmCache()
  assert.deepEqual(r, { read: 2, of: 2 }) // src/a.js and src/b.js (node_modules is left out)
  assert.equal(cache.isCached(`${w.id}:src/b.js`), true)
})
