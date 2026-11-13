// Files and drafts (docs/files-and-drafts.md): what's stored, and the
// one-time migration of documents from earlier versions.
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'

class FakeStorage {
  constructor() { this.map = new Map() }
  get length() { return this.map.size }
  key(i) { return [...this.map.keys()][i] ?? null }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  removeItem(k) { this.map.delete(k) }
  setItem(k, v) { this.map.set(k, String(v)) }
}

// A fresh copy of the store, like reloading the page (localStorage backend
// unless globalThis.indexedDB is set).
let n = 0
const load = async () => {
  const s = await import(`../src/store.js?${n++}`)
  await s.ready
  return s
}
const stored = (id) => JSON.parse(localStorage.getItem('editor.doc.' + id))

beforeEach(() => {
  globalThis.localStorage = new FakeStorage()
  delete globalThis.indexedDB
})
afterEach(() => { delete globalThis.indexedDB })

// A file record as an open folder makes it.
function fileDoc(s, content = 'on disk') {
  const d = s.createDoc('app.js', content, { autoName: false, kind: 'file', linked: true, source: { root: 'r1', path: 'src/app.js' } })
  return d
}

test('a file with nothing unsaved is stored without its text; with unsaved changes, in full', async () => {
  const s = await load()
  const f = fileDoc(s)
  const draft = s.createDoc('notes.txt', 'my notes')
  await s.flushAll()
  assert.equal(stored(f.id).content, '')
  assert.equal(stored(f.id).textOnDisk, true)
  assert.equal(stored(draft.id).content, 'my notes')
  assert.equal(s.getDoc(f.id).content, 'on disk', 'the text stays in memory while open')

  s.updateDoc(f.id, { content: 'edited' }) // now differs from the file
  await s.flushAll()
  assert.equal(stored(f.id).content, 'edited')
  assert.equal(stored(f.id).textOnDisk, undefined)
})

test('after a reload, a file stored without its text is unread until read from disk', async () => {
  const s = await load()
  const f = fileDoc(s)
  await s.flushAll()
  const s2 = await load()
  const d = s2.getDoc(f.id)
  assert.equal(d.unread, true)
  assert.equal(d.content, '')
  assert.equal(d.textOnDisk, undefined, 'a storage detail, not kept in memory')

  s2.fillText(f.id, 'read from disk', { eol: '\n' })
  assert.equal(s2.getDoc(f.id).unread, undefined)
  assert.equal(s2.getDoc(f.id).content, 'read from disk')
  assert.notEqual(s2.getDoc(f.id).diskDirty, true, 'reading is not an edit')
  await s2.flushAll()
  assert.equal(stored(f.id).content, '', 'still not stored')
  assert.equal(stored(f.id).unread, undefined)
})

test('backups hold drafts and unsaved file edits, not copies of saved files', async () => {
  const s = await load()
  const clean = fileDoc(s)
  const edited = fileDoc(s)
  s.updateDoc(edited.id, { content: 'unsaved edit' })
  const draft = s.createDoc('notes.txt', 'notes')
  const ids = s.exportBackup().docs.map((d) => d.id)
  assert.ok(ids.includes(draft.id))
  assert.ok(ids.includes(edited.id))
  assert.ok(!ids.includes(clean.id))
  const e = s.exportBackup().docs.find((d) => d.id === edited.id)
  assert.equal(e.kind, 'draft')
  assert.equal(e.source, undefined)
})

test('a backup entry with no text (a file stored without it) is never imported', async () => {
  const s = await load()
  const r = s.importBackup({ format: s.BACKUP_FORMAT, docs: [{ id: 'x', name: 'a.js', content: '', textOnDisk: true }] })
  assert.equal(r.added, 0)
})

test('rescue copies skip files with nothing unsaved: their text is on disk', async () => {
  globalThis.indexedDB = new IDBFactory()
  const s = await load()
  const f = fileDoc(s)
  const draft = s.createDoc('notes.txt', 'unsaved')
  s.setDocOptions(f.id, { wrap: true }) // pending, but nothing unsaved in the text
  s.rescueUnsaved()
  assert.equal(localStorage.getItem('editor.rescue.' + f.id), null)
  assert.ok(localStorage.getItem('editor.rescue.' + draft.id))
  await s.flushAll()
})

test('another tab that hasn’t read a file yet doesn’t blank it here', async () => {
  const s = await load()
  const f = fileDoc(s)
  await s.flushAll()
  s.handleRemoteChange({ type: 'put', doc: { ...s.getDoc(f.id), content: '', unread: true, wrap: true } })
  assert.equal(s.getDoc(f.id).content, 'on disk')
  assert.equal(s.getDoc(f.id).unread, undefined)
  assert.equal(s.getDoc(f.id).wrap, true, 'its other changes are taken')
})

// --- Migration ---------------------------------------------------------------------

test('migration: each kind of old document becomes a draft or a file, as planned', async () => {
  const { classify } = await import('../src/migrate.js')
  const open = new Set(['r-open'])
  const src = (root) => ({ root, path: 'src/a.js' })
  // Already migrated: left alone.
  assert.equal(classify({ kind: 'draft' }, open), null)
  // Plain document.
  assert.deepEqual(classify({ content: 'x' }, open), { kind: 'draft' })
  // From a folder that's still open (with or without unsaved changes).
  assert.deepEqual(classify({ source: src('r-open') }, open), { kind: 'file' })
  assert.deepEqual(classify({ source: src('r-open'), diskDirty: true }, open), { kind: 'file' })
  // From a closed folder, with unsaved changes: a draft that remembers where it came from.
  assert.deepEqual(classify({ source: src('r-gone'), diskDirty: true, folder: 'my-app/src' }, open), {
    kind: 'draft',
    source: undefined,
    origin: { folder: 'my-app', path: 'src/a.js' },
  })
  // From a closed folder, nothing unsaved: a draft marked as a copy.
  assert.deepEqual(classify({ source: src('r-gone'), folder: 'my-app/src' }, open), {
    kind: 'draft',
    source: undefined,
    copyOf: { folder: 'my-app', path: 'src/a.js' },
  })
  // In the Trash: a draft, wherever it came from.
  assert.deepEqual(classify({ source: src('r-open'), deletedAt: 1 }, open), { kind: 'draft', source: undefined })
  // A file opened on its own (no folder): a draft, as before, until Recent files (phase 4).
  assert.deepEqual(classify({ linked: true }, open), { kind: 'draft' })
})

test('migration runs once, never deletes text, and stops storing copies of saved files', async () => {
  // Documents as an earlier version stored them.
  const old = [
    { id: 'a', name: 'notes.txt', content: 'notes', updatedAt: 1 },
    { id: 'b', name: 'a.js', content: 'saved file', updatedAt: 1, linked: true, source: { root: 'r-open', path: 'a.js' }, folder: 'open-app' },
    { id: 'c', name: 'b.js', content: 'unsaved edit', updatedAt: 1, linked: true, diskDirty: true, source: { root: 'r-gone', path: 'b.js' }, folder: 'old-app' },
    { id: 'd', name: 'c.js', content: 'copy', updatedAt: 1, linked: true, source: { root: 'r-gone', path: 'c.js' }, folder: 'old-app' },
  ]
  for (const d of old) localStorage.setItem('editor.doc.' + d.id, JSON.stringify(d))
  const n = Date.now()
  const s = await import(`../src/store.js?m${n}`)
  await s.ready
  // What migrate() does, on this fresh copy of the store ("r-open" is open).
  const { classify, SCHEMA } = await import('../src/migrate.js')
  const open = new Set(['r-open'])
  for (const d of [...s.state.docs]) {
    const patch = classify(d, open)
    if (patch) s.setDocOptions(d.id, patch)
  }
  await s.flushAll()

  const kinds = Object.fromEntries(s.state.docs.map((d) => [d.id, d.kind]))
  assert.deepEqual(kinds, { a: 'draft', b: 'file', c: 'draft', d: 'draft' })
  assert.equal(s.state.docs.length, 4, 'nothing deleted')
  assert.equal(stored('b').content, '', 'the saved file’s copy is no longer stored')
  assert.equal(s.getDoc('b').content, 'saved file', 'but stays in memory this session')
  assert.equal(stored('c').content, 'unsaved edit')
  assert.equal(stored('d').content, 'copy', 'copies are offered to the Trash, never removed silently')
  assert.ok(s.getDoc('d').copyOf)
  assert.equal(SCHEMA, 2)
})
