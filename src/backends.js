// Where documents are kept. Two interchangeable backends with the same
// promise-based interface:
//
//   loadAll()           -> { docs: Doc[], failed: Doc[] }   (failed = found but not stored here yet)
//   put(doc)            -> stores one document (a plain object)
//   remove(id)          -> deletes one document and its file handle
//   getHandle(id)       -> the FileSystemFileHandle linked to a document, or null
//   putHandle(id, h)    -> links a file handle (null unlinks)
//
// IndexedDB is the normal one: it can hold hundreds of MB, and stores file
// handles so "Save" can write back to a file after a reload. localStorage
// (about 5 MB, no file handles across reloads) is the fallback for browsers
// where IndexedDB can't be opened.

const LS_PREFIX = 'editor.doc.'
const LS_LEGACY_KEY = 'editor.documents.v1'

const isDoc = (d) => d && typeof d.id === 'string' && typeof d.content === 'string'

function parse(json) {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

// --- localStorage ---------------------------------------------------------

// Every document from localStorage, in both the per-document format and the
// old single-key one (per-document copies win).
function readLocalStorage(ls) {
  const byId = new Map()
  const legacy = parse(ls.getItem(LS_LEGACY_KEY))
  if (Array.isArray(legacy)) for (const d of legacy) if (isDoc(d)) byId.set(d.id, { doc: d, legacy: true })
  for (let i = 0; i < ls.length; i++) {
    const key = ls.key(i)
    if (!key?.startsWith(LS_PREFIX)) continue
    const d = parse(ls.getItem(key))
    if (isDoc(d)) byId.set(d.id, { doc: d, legacy: false })
  }
  return [...byId.values()]
}

export function localStorageBackend(ls = globalThis.localStorage) {
  const handles = new Map() // in memory only: localStorage can't hold them

  function dropFromLegacy(id) {
    const legacy = parse(ls.getItem(LS_LEGACY_KEY))
    if (!Array.isArray(legacy)) return
    const rest = legacy.filter((d) => d?.id !== id)
    if (rest.length === legacy.length) return
    if (rest.length) ls.setItem(LS_LEGACY_KEY, JSON.stringify(rest))
    else ls.removeItem(LS_LEGACY_KEY)
  }

  return {
    kind: 'localStorage',
    async loadAll() {
      const docs = []
      const failed = []
      // Move documents out of the old single-key format one at a time, so
      // there is never a need for room for two full copies. Anything that
      // doesn't fit stays in the old entry and is reported as not saved.
      for (const { doc, legacy } of readLocalStorage(ls)) {
        if (!legacy) {
          docs.push(doc)
          continue
        }
        try {
          ls.setItem(LS_PREFIX + doc.id, JSON.stringify(doc))
          dropFromLegacy(doc.id)
          docs.push(doc)
        } catch {
          failed.push(doc)
        }
      }
      return { docs, failed }
    },
    async put(doc) {
      ls.setItem(LS_PREFIX + doc.id, JSON.stringify(doc))
      dropFromLegacy(doc.id)
    },
    async remove(id) {
      handles.delete(id)
      ls.removeItem(LS_PREFIX + id)
      dropFromLegacy(id)
    },
    async getHandle(id) {
      return handles.get(id) ?? null
    },
    async putHandle(id, handle) {
      if (handle) handles.set(id, handle)
      else handles.delete(id)
    },
  }
}

// --- IndexedDB ------------------------------------------------------------

const DB_NAME = 'editor'
const DOCS = 'docs'
const HANDLES = 'handles'

const done = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const committed = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
  })

export async function openIndexedDB(idb = globalThis.indexedDB) {
  if (!idb) throw new Error('IndexedDB is not available')
  const open = idb.open(DB_NAME, 1)
  open.onupgradeneeded = () => {
    const db = open.result
    if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS, { keyPath: 'id' })
    if (!db.objectStoreNames.contains(HANDLES)) db.createObjectStore(HANDLES)
  }
  const db = await done(open)
  // Another tab upgrading the database later: step aside rather than block it.
  db.onversionchange = () => db.close()
  return db
}

export function indexedDBBackend(db, ls = globalThis.localStorage) {
  async function run(stores, mode, fn) {
    const tx = db.transaction(stores, mode)
    const result = fn(tx)
    await committed(tx)
    return result
  }

  // Bring documents over from localStorage (earlier versions of the app).
  // They're removed from localStorage only once IndexedDB has committed them.
  async function migrate() {
    if (!ls) return
    let found
    try {
      found = readLocalStorage(ls)
    } catch {
      return
    }
    if (!found.length) return
    await run([DOCS], 'readwrite', (tx) => {
      const store = tx.objectStore(DOCS)
      for (const { doc } of found) {
        // Never overwrite something already in IndexedDB.
        const req = store.get(doc.id)
        req.onsuccess = () => {
          if (!req.result) store.put(doc)
        }
      }
    })
    for (const { doc } of found) ls.removeItem(LS_PREFIX + doc.id)
    ls.removeItem(LS_LEGACY_KEY)
  }

  return {
    kind: 'indexedDB',
    async loadAll() {
      await migrate()
      const docs = await run([DOCS], 'readonly', (tx) => done(tx.objectStore(DOCS).getAll()))
      return { docs: (await docs).filter(isDoc), failed: [] }
    },
    put: (doc) => run([DOCS], 'readwrite', (tx) => tx.objectStore(DOCS).put(doc)),
    remove: (id) =>
      run([DOCS, HANDLES], 'readwrite', (tx) => {
        tx.objectStore(DOCS).delete(id)
        tx.objectStore(HANDLES).delete(id)
      }),
    async getHandle(id) {
      const req = await run([HANDLES], 'readonly', (tx) => done(tx.objectStore(HANDLES).get(id)))
      return (await req) ?? null
    },
    putHandle: (id, handle) =>
      run([HANDLES], 'readwrite', (tx) =>
        handle ? tx.objectStore(HANDLES).put(handle, id) : tx.objectStore(HANDLES).delete(id),
      ),
  }
}

// IndexedDB if it works here, else localStorage.
export async function openBackend() {
  try {
    return indexedDBBackend(await openIndexedDB())
  } catch (e) {
    if (globalThis.indexedDB) console.warn('IndexedDB unavailable, keeping documents in localStorage', e)
    return localStorageBackend()
  }
}
