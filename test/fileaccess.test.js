import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'

// A stand-in for a FileSystemFileHandle backed by memory.
class FakeHandle {
  constructor(name, text = '', { permission = 'granted' } = {}) {
    this.kind = 'file'
    this.name = name
    this.bytes = new TextEncoder().encode(text)
    this.lastModified = 1000
    this.permission = permission
    this.requests = 0
  }
  async queryPermission() { return this.permission }
  async requestPermission() { this.requests++; return this.permission }
  async getFile() {
    if (this.missing) { const e = new Error('gone'); e.name = 'NotFoundError'; throw e }
    return new File([this.bytes], this.name, { lastModified: this.lastModified })
  }
  async createWritable() {
    const chunks = []
    return {
      write: async (blob) => chunks.push(new Uint8Array(await blob.arrayBuffer())),
      close: async () => { this.bytes = chunks[0]; this.lastModified++ },
      abort: async () => {},
    }
  }
  text() { return new TextDecoder(this.decoding ?? 'utf-8').decode(this.bytes) }
}

let picked = null
afterEach(() => {
  delete globalThis.showOpenFilePicker
  delete globalThis.showSaveFilePicker
  delete globalThis.indexedDB
})

// fileaccess.js imports './store.js' without the query string, so load both
// through a tiny loader that shares one store instance per test.
async function load() {
  globalThis.indexedDB = new IDBFactory()
  picked = null
  globalThis.showOpenFilePicker = async () => []
  globalThis.showSaveFilePicker = async ({ suggestedName }) => {
    if (!picked) { const e = new Error('cancel'); e.name = 'AbortError'; throw e }
    picked.suggested = suggestedName
    return picked
  }
  const store = await import('../src/store.js')
  await store.useBackend()
  const fa = await import('../src/fileaccess.js')
  return { store, fa }
}

test('opening with a handle links the file; Save writes it back in place, in its encoding', async () => {
  const { store, fa } = await load()
  const h = new FakeHandle('notes.txt', 'hello\r\nworld\r\n')
  const doc = await store.importFile(await h.getFile(), h)
  assert.equal(doc.linked, true)
  store.updateDoc(doc.id, { content: 'hello\nthere\n' })
  assert.equal(doc.diskDirty, true)
  const r = await fa.saveDoc(doc, { confirm: () => assert.fail('no question expected') })
  assert.deepEqual(r, { result: 'saved', name: 'notes.txt' })
  assert.equal(h.text(), 'hello\r\nthere\r\n', 'line endings kept')
  assert.equal(doc.diskDirty, false)
  assert.equal(doc.diskModified, h.lastModified)
})

test('Save asks before overwriting a file changed on disk since it was opened', async () => {
  const { store, fa } = await load()
  const h = new FakeHandle('a.txt', 'v1')
  const doc = await store.importFile(await h.getFile(), h)
  h.bytes = new TextEncoder().encode('changed elsewhere')
  h.lastModified += 50
  store.updateDoc(doc.id, { content: 'mine' })
  let asked = ''
  assert.deepEqual(await fa.saveDoc(doc, { confirm: (m) => ((asked = m), false) }), { result: 'cancelled' })
  assert.match(asked, /changed on disk/)
  assert.equal(h.text(), 'changed elsewhere', 'their version left alone')
  assert.equal((await fa.saveDoc(doc, { confirm: () => true })).result, 'saved')
  assert.equal(h.text(), 'mine')
})

test('without a link (or with Save as), Save asks where to save and links that file', async () => {
  const { store, fa } = await load()
  const doc = store.createDoc('draft.md', '# Hi')
  assert.deepEqual(await fa.saveDoc(doc), { result: 'cancelled' }, 'picker cancelled')
  picked = new FakeHandle('final.md')
  const r = await fa.saveDoc(doc)
  assert.deepEqual(r, { result: 'saved', name: 'final.md' })
  assert.equal(picked.suggested, 'draft.md')
  assert.equal(picked.text(), '# Hi')
  assert.equal(store.getDoc(doc.id).name, 'final.md', 'document takes the file name')
  assert.equal(await store.getFileHandle(doc.id), picked)
})

test('a file moved or deleted on disk falls back to asking where to save', async () => {
  const { store, fa } = await load()
  const h = new FakeHandle('a.txt', 'x')
  const doc = await store.importFile(await h.getFile(), h)
  h.missing = true
  picked = new FakeHandle('b.txt')
  assert.equal((await fa.saveDoc(doc)).name, 'b.txt')
})

test('no permission to write: nothing is written', async () => {
  const { store, fa } = await load()
  const h = new FakeHandle('a.txt', 'x', { permission: 'denied' })
  const doc = await store.importFile(await h.getFile(), h)
  store.updateDoc(doc.id, { content: 'y' })
  assert.deepEqual(await fa.saveDoc(doc), { result: 'cancelled' })
  assert.equal(h.requests, 1)
  assert.equal(h.text(), 'x')
})

test('text that does not fit the file encoding asks before switching to UTF-8', async () => {
  const { store, fa } = await load()
  const h = new FakeHandle('latin.txt')
  h.bytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9]) // "café" in Windows-1252
  const doc = await store.importFile(await h.getFile(), h)
  assert.equal(doc.encoding, 'windows-1252')
  store.updateDoc(doc.id, { content: 'café ✓' })
  assert.deepEqual(await fa.saveDoc(doc, { confirm: () => false }), { result: 'cancelled' })
  assert.equal((await fa.saveDoc(doc, { confirm: () => true })).result, 'saved')
  assert.equal(doc.encoding, 'utf-8')
  assert.equal(h.text(), 'café ✓')
})
