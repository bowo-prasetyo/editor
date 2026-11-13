import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'

// Minimal localStorage with a size quota, like browsers have.
class FakeStorage {
  constructor(quota = Infinity) { this.map = new Map(); this.quota = quota }
  get length() { return this.map.size }
  key(i) { return [...this.map.keys()][i] ?? null }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  removeItem(k) { this.map.delete(k) }
  setItem(k, v) {
    v = String(v)
    let size = 0
    for (const [key, val] of this.map) if (key !== k) size += key.length + val.length
    if (size + k.length + v.length > this.quota) {
      const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e
    }
    this.map.set(k, v)
  }
}

// Each load is a fresh copy of the store, like reloading the page. Without
// globalThis.indexedDB it falls back to localStorage.
let n = 0
const load = async () => {
  const s = await import(`../src/store.js?${n++}`)
  await s.ready
  return s
}

beforeEach(() => {
  globalThis.localStorage = new FakeStorage()
  delete globalThis.indexedDB
})
afterEach(() => { delete globalThis.indexedDB })

const stored = (id) => JSON.parse(localStorage.getItem('editor.doc.' + id))

test('each document is saved under its own key', async () => {
  const s = await load()
  const a = s.createDoc('a.txt', 'A')
  s.updateDoc(a.id, { content: 'A2' })
  assert.equal(s.state.status[a.id], 'pending')
  await s.flushAll()
  assert.equal(s.state.status[a.id], 'saved')
  assert.equal(stored(a.id).content, 'A2')
  const s2 = await load()
  assert.deepEqual(s2.state.docs.map((d) => d.content), ['A2'])
})

test('a document too big for the quota is flagged and does not block others', async () => {
  globalThis.localStorage = new FakeStorage(2000)
  const s = await load()
  const small = s.createDoc('small.txt', 'hi')
  const big = s.createDoc('big.txt', '')
  s.updateDoc(big.id, { content: 'x'.repeat(5000) })
  s.updateDoc(small.id, { content: 'hello' })
  await s.flushAll()
  assert.equal(s.state.status[big.id], 'error')
  assert.equal(s.state.status[small.id], 'saved')
  assert.equal(s.hasUnsaved(), true)
  // Shrinking it lets it save again.
  s.updateDoc(big.id, { content: 'short' })
  await s.flushAll()
  assert.equal(s.state.status[big.id], 'saved')
})

test('deleting a document retries documents that failed to save', async () => {
  globalThis.localStorage = new FakeStorage(3000)
  const s = await load()
  const filler = s.createDoc('filler.txt', 'f'.repeat(1500))
  const doc = s.createDoc('doc.txt', 'd'.repeat(1500))
  await s.flushAll()
  assert.equal(s.state.status[doc.id], 'error')
  await s.deleteDoc(filler.id)
  assert.equal(s.state.status[doc.id], 'saved')
})

test('migrates documents from the old single-key format', async () => {
  const old = [
    { id: '1', name: 'one.txt', content: 'one', updatedAt: 1 },
    { id: '2', name: 'two.txt', content: 'two', updatedAt: 2 },
  ]
  localStorage.setItem('editor.documents.v1', JSON.stringify(old))
  const s = await load()
  assert.deepEqual(s.state.docs.map((d) => d.id).sort(), ['1', '2'])
  assert.equal(localStorage.getItem('editor.documents.v1'), null)
  assert.equal(JSON.parse(localStorage.getItem('editor.doc.2')).content, 'two')
})

test('documents that do not fit during migration stay in the old entry and are kept', async () => {
  const old = [
    { id: '1', name: 'one.txt', content: 'a'.repeat(100), updatedAt: 1 },
    { id: '2', name: 'two.txt', content: 'b'.repeat(800), updatedAt: 2 },
  ]
  globalThis.localStorage = new FakeStorage(1300)
  localStorage.setItem('editor.documents.v1', JSON.stringify(old))
  const s = await load()
  assert.equal(s.state.docs.length, 2)
  assert.equal(s.state.status['1'], 'saved')
  assert.equal(s.state.status['2'], 'error')
  assert.equal(JSON.parse(localStorage.getItem('editor.documents.v1'))[0].id, '2')
})

test('documents created in another tab appear, and are not overwritten', async () => {
  const s = await load()
  const mine = s.createDoc('mine.txt', 'mine')
  const theirs = { id: 'other', name: 'theirs.txt', content: 'theirs', updatedAt: 5 }
  localStorage.setItem('editor.doc.other', JSON.stringify(theirs))
  s.handleRemoteChange({ type: 'put', doc: theirs })
  s.updateDoc(mine.id, { content: 'mine 2' })
  await s.flushAll()
  assert.equal(stored('other').content, 'theirs')
  assert.deepEqual(s.state.docs.map((d) => d.name).sort(), ['mine.txt', 'theirs.txt'])
})

test('a clean document takes the other tab\'s edits; a dirty one keeps both', async () => {
  const s = await load()
  const doc = s.createDoc('a.txt', 'v1')
  await s.flushAll()
  const remote = (content) => ({ type: 'put', doc: { ...doc, content } })
  s.handleRemoteChange(remote('v2 from other tab'))
  assert.equal(s.getDoc(doc.id).content, 'v2 from other tab')

  s.updateDoc(doc.id, { content: 'my unsaved edit' })
  s.handleRemoteChange(remote('v3 from other tab'))
  assert.equal(s.getDoc(doc.id).content, 'my unsaved edit')
  const copy = s.state.docs.find((d) => d.content === 'v3 from other tab')
  assert.ok(copy, 'other tab\'s version kept as a copy')
  assert.match(copy.name, /changed in another tab/)
})

test('a deletion in another tab removes the doc unless it has unsaved edits', async () => {
  const s = await load()
  const a = s.createDoc('a.txt', 'a')
  const b = s.createDoc('b.txt', 'b')
  await s.flushAll()
  s.updateDoc(b.id, { content: 'b edited' })
  s.handleRemoteChange({ type: 'delete', id: a.id })
  s.handleRemoteChange({ type: 'delete', id: b.id })
  assert.equal(s.getDoc(a.id), undefined)
  assert.equal(s.getDoc(b.id).content, 'b edited')
  await s.flushAll()
  assert.ok(localStorage.getItem('editor.doc.' + b.id))
})

test('trash: delete is reversible, persists, and "delete forever" frees the key', async () => {
  const s = await load()
  const a = s.createDoc('a.txt', 'keep me')
  const before = a.updatedAt
  await s.trashDoc(a.id)
  assert.ok(JSON.parse(localStorage.getItem('editor.doc.' + a.id)).deletedAt)
  assert.equal(s.getDoc(a.id).updatedAt, before, 'trashing is not an edit')
  await s.restoreDoc(a.id)
  assert.equal(JSON.parse(localStorage.getItem('editor.doc.' + a.id)).deletedAt, undefined)
  await s.trashDoc(a.id)
  await s.emptyTrash()
  assert.equal(s.getDoc(a.id), undefined)
  assert.equal(localStorage.getItem('editor.doc.' + a.id), null)
})

test('trash: documents older than the retention period are purged on load', async () => {
  const day = 24 * 60 * 60 * 1000
  const put = (id, deletedAt) =>
    localStorage.setItem('editor.doc.' + id, JSON.stringify({ id, name: id, content: '', updatedAt: 1, deletedAt }))
  put('old', Date.now() - 31 * day)
  put('recent', Date.now() - 2 * day)
  put('live', undefined)
  const s = await load()
  assert.deepEqual(s.state.docs.map((d) => d.id).sort(), ['live', 'recent'])
  assert.equal(localStorage.getItem('editor.doc.old'), null)
})

test('view options are saved without bumping updatedAt', async () => {
  const s = await load()
  const a = s.createDoc('a.txt', 'x')
  const before = a.updatedAt
  s.setDocOptions(a.id, { wrap: false })
  await s.flushAll()
  assert.equal(JSON.parse(localStorage.getItem('editor.doc.' + a.id)).wrap, false)
  assert.equal(s.getDoc(a.id).updatedAt, before)
})

test('new documents are named from their first line until renamed', async () => {
  const s = await load()
  const d = s.createDoc()
  s.updateDoc(d.id, { content: 'Groceries\nmilk' })
  assert.equal(s.getDoc(d.id).name, 'Groceries.md')
  s.updateDoc(d.id, { name: 'list.txt' })
  s.updateDoc(d.id, { content: 'Something else' })
  assert.equal(s.getDoc(d.id).name, 'list.txt')
  assert.equal(s.createDoc('opened.txt', 'x').autoName, false)
})

test('opening a file keeps its encoding and line endings', async () => {
  const s = await load()
  const file = new File([new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0d, 0x0a])], 'latin.txt')
  const d = await s.importFile(file)
  assert.deepEqual([d.content, d.encoding, d.eol, d.autoName], ['café\n', 'windows-1252', '\r\n', false])
  await assert.rejects(s.importFile(new File([new Uint8Array([0, 1, 2, 0])], 'x.bin')), s.BinaryFileError)
})

test('backup round trip adds missing docs, skips identical ones, copies changed ones', async () => {
  const s = await load()
  const a = s.createDoc('a.txt', 'A')
  const b = s.createDoc('b.txt', 'B')
  await s.trashDoc(b.id)
  const backup = JSON.parse(JSON.stringify(s.exportBackup()))
  assert.equal(backup.docs.length, 2)

  await s.deleteDoc(b.id)
  s.updateDoc(a.id, { content: 'A changed' })
  const result = s.importBackup(backup)
  assert.deepEqual(result, { added: 2, skipped: 0 })
  assert.equal(s.getDoc(b.id).deletedAt, backup.docs.find((d) => d.id === b.id).deletedAt, 'trash state kept')
  assert.equal(s.getDoc(a.id).content, 'A changed', 'existing doc not overwritten')
  assert.ok(s.state.docs.find((d) => d.name === 'a.txt (from backup)' && d.content === 'A'))

  assert.deepEqual(s.importBackup(backup), { added: 0, skipped: 2 }, 'importing twice adds nothing')
  assert.throws(() => s.importBackup({ docs: [] }), /isn't a Plumb backup\./)
})

// --- IndexedDB ---------------------------------------------------------------

const useIDB = () => { globalThis.indexedDB = new IDBFactory() }

test('indexedDB: documents are kept there, survive a reload, and hold more than localStorage', async () => {
  useIDB()
  globalThis.localStorage = new FakeStorage(1000)
  const s = await load()
  assert.equal(s.state.backend, 'indexedDB')
  const big = s.createDoc('big.txt', 'x'.repeat(50_000))
  s.updateDoc(big.id, { content: 'y'.repeat(60_000) })
  assert.equal(s.state.status[big.id], 'pending')
  await s.flushAll()
  assert.equal(s.state.status[big.id], 'saved')
  assert.equal(localStorage.length, 0, 'nothing written to localStorage')
  const s2 = await load()
  assert.equal(s2.getDoc(big.id).content, 'y'.repeat(60_000))
})

test('indexedDB: moves documents over from localStorage, then removes them there', async () => {
  useIDB()
  localStorage.setItem('editor.doc.1', JSON.stringify({ id: '1', name: 'one.txt', content: 'one', updatedAt: 1 }))
  localStorage.setItem('editor.documents.v1', JSON.stringify([{ id: '2', name: 'two.txt', content: 'two', updatedAt: 2 }]))
  localStorage.setItem('editor.prefs.v1', '{"fontSize":16}')
  const s = await load()
  assert.deepEqual(s.state.docs.map((d) => d.content).sort(), ['one', 'two'])
  assert.deepEqual([...localStorage.map.keys()], ['editor.prefs.v1'], 'only preferences are left')
  const s2 = await load()
  assert.deepEqual(s2.state.docs.map((d) => d.content).sort(), ['one', 'two'])
})

test('indexedDB: a write in flight does not resurrect a document deleted after it', async () => {
  useIDB()
  const s = await load()
  const d = s.createDoc('a.txt', 'a')
  s.updateDoc(d.id, { content: 'b' })
  s.flushAll() // not awaited: the delete is queued behind the write
  await s.deleteDoc(d.id)
  const s2 = await load()
  assert.equal(s2.getDoc(d.id), undefined)
})

test('indexedDB: edits made while a save is running keep the document marked unsaved', async () => {
  useIDB()
  const s = await load()
  const d = s.createDoc('a.txt', 'a')
  const writing = s.flushAll()
  s.updateDoc(d.id, { content: 'typed during the write' })
  await writing
  assert.equal(s.state.status[d.id], 'pending')
  await s.flushAll()
  assert.equal(s.state.status[d.id], 'saved')
})

test('file links: handles are stored with the doc, editing marks the file out of date, backups drop the link', async () => {
  useIDB()
  const s = await load()
  const d = s.createDoc('a.txt', 'a', { autoName: false })
  const handle = { kind: 'file', name: 'a.txt' } // stands in for a FileSystemFileHandle
  await s.linkFile(d.id, handle, 123)
  assert.deepEqual([d.linked, d.diskDirty, d.diskModified], [true, false, 123])
  s.updateDoc(d.id, { content: 'changed' })
  assert.equal(s.getDoc(d.id).diskDirty, true)
  await s.flushAll()

  const s2 = await load()
  assert.deepEqual(await s2.getFileHandle(d.id), handle)
  const exported = s2.exportBackup().docs[0]
  assert.equal('linked' in exported || 'diskModified' in exported, false)
  await s2.deleteDoc(d.id)
  assert.equal(await s2.getFileHandle(d.id), null)
})

test('indexedDB: a write cut off by closing the page is recovered from the rescue copy', async () => {
  useIDB()
  const s = await load()
  const d = s.createDoc('a.txt', 'v1')
  await s.flushAll()
  s.updateDoc(d.id, { content: 'typed just before closing' })
  // The page closes: the write is started but never lands; the rescue copy is synchronous.
  assert.equal(s.rescueUnsaved(), true)
  assert.ok(localStorage.getItem('editor.rescue.' + d.id))

  const s2 = await load() // same IndexedDB, which still has v1
  assert.equal(s2.getDoc(d.id).content, 'typed just before closing')
  assert.equal(s2.state.status[d.id], 'saved')
  assert.equal(localStorage.getItem('editor.rescue.' + d.id), null, 'copy dropped once written')
  const s3 = await load()
  assert.equal(s3.getDoc(d.id).content, 'typed just before closing')
})

test('indexedDB: a rescue copy also brings back fields removed since the last write (restored from the Trash)', async () => {
  useIDB()
  const s = await load()
  const d = s.createDoc('a.txt', 'keep me')
  await s.trashDoc(d.id) // in IndexedDB: in the Trash
  // Restored, and the page closes before that write lands: only the rescue copy has it.
  delete s.getDoc(d.id).deletedAt
  s.state.status[d.id] = 'pending'
  assert.equal(s.rescueUnsaved(), true)

  const s2 = await load()
  assert.equal(s2.getDoc(d.id).deletedAt, undefined, 'out of the Trash, as it was when the page closed')
  const s3 = await load()
  assert.equal(s3.getDoc(d.id).deletedAt, undefined)
})

test('indexedDB: an older rescue copy never replaces a newer saved version', async () => {
  useIDB()
  const s = await load()
  const d = s.createDoc('a.txt', 'new')
  await s.flushAll()
  localStorage.setItem('editor.rescue.' + d.id, JSON.stringify({ ...d, content: 'old', updatedAt: 1 }))
  const s2 = await load()
  assert.equal(s2.getDoc(d.id).content, 'new')
  assert.equal(localStorage.getItem('editor.rescue.' + d.id), null)
})

test('labels: setting or removing one keeps the edit time', async () => {
  const s = await load()
  const a = s.createDoc('a.txt', 'a', { autoName: false })
  assert.ok(a.createdAt)
  const edited = a.updatedAt
  s.moveToFolder(a.id, ' Work / Clients ')
  assert.equal(s.getDoc(a.id).folder, 'Work/Clients')
  assert.equal(s.getDoc(a.id).updatedAt, edited)
  s.moveToFolder(a.id, '')
  assert.equal(s.getDoc(a.id).folder, undefined)
  await s.flushAll()
  assert.equal('folder' in stored(a.id), false)
})

test('history: opened files get a version; restoring keeps the current text first', async () => {
  useIDB()
  const s = await load()
  const doc = await s.importFile(new File(['first'], 'a.txt'))
  await new Promise((r) => setTimeout(r, 20))
  s.updateDoc(doc.id, { content: 'second' })
  await s.flushAll()
  const [opened] = await s.listVersions(doc.id)
  assert.equal(opened.kind, 'opened')
  assert.equal(await s.versionText(opened.id), 'first')
  assert.equal(await s.restoreVersion(doc.id, opened.id), 'first')
  assert.equal(s.getDoc(doc.id).content, 'first')
  const list = await s.listVersions(doc.id)
  assert.deepEqual(list.map((v) => v.kind), ['opened', 'restore'])
  assert.equal(await s.versionText(list[1].id), 'second', 'the replaced text is kept')
  await s.recordVersion(doc.id, 'manual', 'Milestone')
  assert.equal((await s.listVersions(doc.id)).at(-1).label, 'Milestone')
  await s.deleteDoc(doc.id)
  assert.deepEqual(await s.listVersions(doc.id), [])
})
