import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

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

let n = 0
const load = () => import(`../src/store.js?${n++}`)

beforeEach(() => { globalThis.localStorage = new FakeStorage() })

test('each document is saved under its own key', async () => {
  const s = await load()
  const a = s.createDoc('a.txt', 'A')
  s.updateDoc(a.id, { content: 'A2' })
  assert.equal(s.state.status[a.id], 'pending')
  s.flushAll()
  assert.equal(s.state.status[a.id], 'saved')
  assert.equal(JSON.parse(localStorage.getItem('editor.doc.' + a.id)).content, 'A2')
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
  s.flushAll()
  assert.equal(s.state.status[big.id], 'error')
  assert.equal(s.state.status[small.id], 'saved')
  assert.equal(s.hasUnsaved(), true)
  // Shrinking it lets it save again.
  s.updateDoc(big.id, { content: 'short' })
  s.flushAll()
  assert.equal(s.state.status[big.id], 'saved')
})

test('deleting a document retries documents that failed to save', async () => {
  globalThis.localStorage = new FakeStorage(3000)
  const s = await load()
  const filler = s.createDoc('filler.txt', 'f'.repeat(1500))
  const doc = s.createDoc('doc.txt', 'd'.repeat(1500))
  assert.equal(s.state.status[doc.id], 'error')
  s.deleteDoc(filler.id)
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
  s.handleStorageEvent({ key: 'editor.doc.other', newValue: JSON.stringify(theirs) })
  s.updateDoc(mine.id, { content: 'mine 2' })
  s.flushAll()
  assert.equal(JSON.parse(localStorage.getItem('editor.doc.other')).content, 'theirs')
  assert.deepEqual(s.state.docs.map((d) => d.name).sort(), ['mine.txt', 'theirs.txt'])
})

test('a clean document takes the other tab\'s edits; a dirty one keeps both', async () => {
  const s = await load()
  const doc = s.createDoc('a.txt', 'v1')
  const remote = (content) => ({
    key: 'editor.doc.' + doc.id,
    newValue: JSON.stringify({ ...doc, content }),
  })
  s.handleStorageEvent(remote('v2 from other tab'))
  assert.equal(s.getDoc(doc.id).content, 'v2 from other tab')

  s.updateDoc(doc.id, { content: 'my unsaved edit' })
  s.handleStorageEvent(remote('v3 from other tab'))
  assert.equal(s.getDoc(doc.id).content, 'my unsaved edit')
  const copy = s.state.docs.find((d) => d.content === 'v3 from other tab')
  assert.ok(copy, 'other tab\'s version kept as a copy')
  assert.match(copy.name, /changed in another tab/)
})

test('a deletion in another tab removes the doc unless it has unsaved edits', async () => {
  const s = await load()
  const a = s.createDoc('a.txt', 'a')
  const b = s.createDoc('b.txt', 'b')
  s.updateDoc(b.id, { content: 'b edited' })
  s.handleStorageEvent({ key: 'editor.doc.' + a.id, newValue: null })
  s.handleStorageEvent({ key: 'editor.doc.' + b.id, newValue: null })
  assert.equal(s.getDoc(a.id), undefined)
  assert.equal(s.getDoc(b.id).content, 'b edited')
  s.flushAll()
  assert.ok(localStorage.getItem('editor.doc.' + b.id))
})

test('trash: delete is reversible, persists, and "delete forever" frees the key', async () => {
  const s = await load()
  const a = s.createDoc('a.txt', 'keep me')
  const before = a.updatedAt
  s.trashDoc(a.id)
  assert.ok(JSON.parse(localStorage.getItem('editor.doc.' + a.id)).deletedAt)
  assert.equal(s.getDoc(a.id).updatedAt, before, 'trashing is not an edit')
  s.restoreDoc(a.id)
  assert.equal(JSON.parse(localStorage.getItem('editor.doc.' + a.id)).deletedAt, undefined)
  s.trashDoc(a.id)
  s.emptyTrash()
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
  s.flushAll()
  assert.equal(JSON.parse(localStorage.getItem('editor.doc.' + a.id)).wrap, false)
  assert.equal(s.getDoc(a.id).updatedAt, before)
})

test('new documents are named from their first line until renamed', async () => {
  const s = await load()
  const d = s.createDoc()
  s.updateDoc(d.id, { content: 'Groceries\nmilk' })
  assert.equal(s.getDoc(d.id).name, 'Groceries.txt')
  s.updateDoc(d.id, { name: 'list.md' })
  s.updateDoc(d.id, { content: 'Something else' })
  assert.equal(s.getDoc(d.id).name, 'list.md')
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
  s.trashDoc(b.id)
  const backup = JSON.parse(JSON.stringify(s.exportBackup()))
  assert.equal(backup.docs.length, 2)

  s.deleteDoc(b.id)
  s.updateDoc(a.id, { content: 'A changed' })
  const result = s.importBackup(backup)
  assert.deepEqual(result, { added: 2, skipped: 0 })
  assert.equal(s.getDoc(b.id).deletedAt, backup.docs.find((d) => d.id === b.id).deletedAt, 'trash state kept')
  assert.equal(s.getDoc(a.id).content, 'A changed', 'existing doc not overwritten')
  assert.ok(s.state.docs.find((d) => d.name === 'a.txt (from backup)' && d.content === 'A'))

  assert.deepEqual(s.importBackup(backup), { added: 0, skipped: 2 }, 'importing twice adds nothing')
  assert.throws(() => s.importBackup({ docs: [] }), /isn't an editor backup\./)
})
