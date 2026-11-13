import { reactive, toRaw } from 'vue'
import { decodeBytes, encodeText } from './textcodec.js'
import { DEFAULT_NAME, nameFromContent } from './naming.js'
import { extension } from './filetype.js'
import { openBackend } from './backends.js'
import { createHistory } from './history.js'
import { normalizeFolder, parentFolder, renamedFolder } from './folders.js'

// Documents live in the browser: IndexedDB normally, localStorage where
// IndexedDB isn't available (see backends.js). The list is kept in memory
// and each document is written back shortly after it changes.
const SAVE_DELAY = 400

// status[id] is 'saved' | 'pending' | 'error'
export const state = reactive({ docs: [], status: {}, backend: null, persisted: false })

let backend = null
let history = null
const timers = new Map()
const versions = new Map() // bumped on every change, to know if a finished write is still current
const chains = new Map() // per-document queue, so writes and deletes land in order

const isDoc = (d) => d && typeof d.id === 'string' && typeof d.content === 'string'
const plain = (doc) => ({ ...toRaw(doc) })

function enqueue(id, task) {
  const next = (chains.get(id) ?? Promise.resolve()).then(task, task)
  chains.set(id, next)
  next.finally(() => chains.get(id) === next && chains.delete(id))
  return next
}

// --- Other tabs -----------------------------------------------------------

// Tabs tell each other about saved changes. IndexedDB has no change events,
// so this uses a BroadcastChannel (not created outside a browser page).
const channel =
  typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('editor.docs')
    : null

function announce(msg) {
  try {
    channel?.postMessage(msg)
  } catch (e) {
    console.error('Could not notify other tabs', e)
  }
}

// --- Loading --------------------------------------------------------------

async function init(chosen) {
  state.docs = []
  state.status = {}
  try {
    backend = chosen ?? (await openBackend())
    history = createHistory(backend)
    state.backend = backend.kind
    const { docs, failed } = await backend.loadAll()
    for (const doc of docs) {
      state.docs.push(doc)
      state.status[doc.id] = 'saved'
    }
    for (const doc of failed) {
      if (getDoc(doc.id)) continue
      state.docs.push(doc)
      state.status[doc.id] = 'error'
    }
  } catch (e) {
    console.error('Could not load documents', e)
  }
  await recoverRescued()
  await purgeOldTrash()
  state.persisted = (await globalThis.navigator?.storage?.persisted?.().catch(() => false)) ?? false
}

// --- Rescue copies ----------------------------------------------------------

// IndexedDB writes finish asynchronously, so one started as the page closes
// may not land. When the page is hidden or closed, documents whose latest
// version isn't committed yet are also copied into localStorage, which
// writes synchronously. The next load takes any copy newer than what
// IndexedDB has. A copy is dropped once its document is safely written.
const RESCUE = 'editor.rescue.'
const rescueStorage = () => {
  try {
    return backend?.kind === 'indexedDB' ? globalThis.localStorage ?? null : null
  } catch {
    return null
  }
}

// Returns false if some unsaved document couldn't be copied.
export function rescueUnsaved() {
  const ls = rescueStorage()
  if (!ls) return !hasUnsaved()
  let ok = true
  for (const [id, s] of Object.entries(state.status)) {
    if (s === 'saved') continue
    const doc = getDoc(id)
    if (!doc) continue
    try {
      ls.setItem(RESCUE + id, JSON.stringify(plain(doc)))
    } catch {
      ok = false
    }
  }
  return ok
}

function dropRescue(id) {
  try {
    rescueStorage()?.removeItem(RESCUE + id)
  } catch {
    // nothing to drop
  }
}

async function recoverRescued() {
  const ls = rescueStorage()
  if (!ls) return
  const found = []
  try {
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i)
      if (key?.startsWith(RESCUE)) found.push(key)
    }
  } catch {
    return
  }
  for (const key of found) {
    let doc = null
    try {
      doc = JSON.parse(ls.getItem(key))
    } catch {
      // unreadable: drop it
    }
    const local = isDoc(doc) && getDoc(doc.id)
    if (isDoc(doc) && (!local || (doc.updatedAt ?? 0) >= (local.updatedAt ?? 0))) {
      if (local) Object.assign(local, doc)
      else state.docs.push(doc)
      state.status[doc.id] = 'pending'
      await flush(doc.id) // drops the copy once written
    } else {
      ls.removeItem(key)
    }
  }
}

// Resolves once documents are loaded. The app mounts after this.
export const ready = init()

// For tests: start over with a given backend.
export function useBackend(b) {
  return init(b)
}

// Ask the browser not to clear our storage when the disk runs low. Chrome
// and Edge decide silently; Firefox asks the user, so this is only called
// after the user creates or opens a document.
let askedPersist = false
export async function requestPersistence() {
  if (askedPersist || state.persisted) return state.persisted
  askedPersist = true
  try {
    state.persisted = (await globalThis.navigator?.storage?.persist?.()) ?? false
  } catch {
    state.persisted = false
  }
  return state.persisted
}

// How much the browser lets us store: { usage, quota } in bytes, or null.
export async function storageEstimate() {
  try {
    return (await globalThis.navigator?.storage?.estimate?.()) ?? null
  } catch {
    return null
  }
}

// --- Saving ---------------------------------------------------------------

function flush(id) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  const doc = getDoc(id)
  if (!doc) return chains.get(id) ?? Promise.resolve()
  const snapshot = plain(doc)
  const version = versions.get(id)
  return enqueue(id, async () => {
    try {
      await backend.put(snapshot)
      // Only call it saved if nothing changed while we were writing.
      if (getDoc(id) && versions.get(id) === version && !timers.has(id)) state.status[id] = 'saved'
      if (state.status[id] === 'saved') dropRescue(id)
      announce({ type: 'put', doc: snapshot })
      // Every few minutes of editing, keep a version (see history.js).
      if (!snapshot.deletedAt) history?.maybeRecord(snapshot).catch((e) => console.error('Could not keep a version', e))
    } catch (e) {
      console.error(`Could not save "${snapshot.name}"`, e)
      if (getDoc(id)) state.status[id] = 'error'
    }
  })
}

function schedule(id) {
  state.status[id] = 'pending'
  versions.set(id, (versions.get(id) ?? 0) + 1)
  clearTimeout(timers.get(id))
  timers.set(id, setTimeout(() => flush(id), SAVE_DELAY))
}

// Save everything right now (page hidden, closing, leaving the editor).
// Resolves when every write has finished.
export function flushAll() {
  for (const id of [...timers.keys()]) flush(id)
  return Promise.all([...chains.values()])
}

// Try again to save documents whose last save failed.
export function retryFailed() {
  return Promise.all(
    Object.entries(state.status)
      .filter(([, s]) => s === 'error')
      .map(([id]) => flush(id)),
  )
}

export function hasUnsaved() {
  return Object.values(state.status).some((s) => s !== 'saved')
}

// --- Public API -----------------------------------------------------------

// extra: { autoName, eol, encoding, bom } and anything else to keep on the doc.
// A new blank document is named from its first line until the user renames it.
export function createDoc(name = DEFAULT_NAME, content = '', extra = { autoName: name === DEFAULT_NAME }) {
  const now = Date.now()
  const doc = { id: crypto.randomUUID(), name, content, createdAt: now, updatedAt: now, ...extra }
  state.docs.unshift(doc)
  schedule(doc.id)
  flush(doc.id)
  return getDoc(doc.id)
}

export function getDoc(id) {
  return state.docs.find((d) => d.id === id)
}

export function updateDoc(id, patch) {
  const doc = getDoc(id)
  if (!doc) return
  if ('name' in patch && !('autoName' in patch)) patch = { ...patch, autoName: false }
  if (doc.autoName && 'content' in patch && !('name' in patch)) {
    patch = { ...patch, name: nameFromContent(patch.content, extension(doc.name) || 'txt') }
  }
  // A document linked to a file on disk now differs from that file.
  if ('content' in patch && doc.linked) patch = { ...patch, diskDirty: true }
  Object.assign(doc, patch, { updatedAt: Date.now() })
  schedule(id)
}

function removeLocal(id) {
  handleCache.delete(id)
  clearTimeout(timers.get(id))
  timers.delete(id)
  versions.delete(id)
  delete state.status[id]
  const i = state.docs.findIndex((d) => d.id === id)
  if (i !== -1) state.docs.splice(i, 1)
}

// Change a document's settings (wrap, spell check, encoding…) without
// marking its content as edited.
export function setDocOptions(id, patch) {
  const doc = getDoc(id)
  if (!doc) return
  Object.assign(doc, patch)
  schedule(id)
}

// --- Version history (see history.js) ----------------------------------------

// Keep the document's current text as a version: kind 'manual' (with an
// optional label), 'saved' (written to a file), 'opened', or 'auto' (skipped
// if nothing changed since the newest version).
export async function recordVersion(id, kind = 'manual', label = '') {
  const doc = getDoc(id)
  if (!doc || !history) return null
  try {
    return await history.record(plain(doc), kind, label)
  } catch (e) {
    console.error('Could not keep a version', e)
    return null
  }
}

export const listVersions = (id) => history?.list(id) ?? Promise.resolve([])
export const versionText = (versionId) => history?.text(versionId) ?? Promise.resolve(null)

// Bring back an older version. The current text is kept as a version first,
// so restoring can itself be undone. Returns the restored text, or null.
export async function restoreVersion(id, versionId) {
  const text = await versionText(versionId)
  if (text == null || !getDoc(id)) return null
  if (text === getDoc(id).content) return text
  await recordVersion(id, 'restore')
  updateDoc(id, { content: text })
  return text
}

// --- Folders (see folders.js) ------------------------------------------------

// Moving isn't an edit: it doesn't change when the document was last edited.
export function moveToFolder(id, folder) {
  setDocOptions(id, { folder: normalizeFolder(folder) || undefined })
}

// Rename folder `from` to `to` (or move it inside another folder), taking its
// documents and subfolders along. Returns how many documents moved.
export function renameFolder(from, to) {
  let n = 0
  for (const d of state.docs) {
    const next = renamedFolder(d.folder, from, normalizeFolder(to))
    if (next === undefined) continue
    moveToFolder(d.id, next)
    n++
  }
  return n
}

// Remove a folder: its documents (and subfolders) move up to its parent.
export const removeFolder = (path) => renameFolder(path, parentFolder(path))

// --- Files on disk (see fileaccess.js) -------------------------------------

// Handles used in this page, so Save doesn't have to read them back each time.
const handleCache = new Map()

export async function getFileHandle(id) {
  if (handleCache.has(id)) return handleCache.get(id)
  const handle = (await backend?.getHandle(id)) ?? null
  if (handle) handleCache.set(id, handle)
  return handle
}

// Remember that a document is the file behind `handle`, as last read from or
// written to disk at `lastModified`.
export async function linkFile(id, handle, lastModified) {
  handleCache.set(id, handle)
  await backend.putHandle(id, handle)
  setDocOptions(id, { linked: true, diskDirty: false, diskModified: lastModified })
}

// Other handles kept with the documents, by key (folders opened from disk:
// see workspace.js). Kept in IndexedDB; in memory only with localStorage.
export const storedHandle = (key) => backend?.getHandle(key) ?? Promise.resolve(null)
export const storeHandle = (key, handle) => backend.putHandle(key, handle)

// The file moved or was renamed on disk: the document now goes with the
// handle for its new place. Nothing else changes (unsaved changes stay unsaved).
export async function relinkFile(id, handle) {
  handleCache.set(id, handle)
  await backend.putHandle(id, handle)
}

export async function unlinkFile(id) {
  handleCache.delete(id)
  await backend.putHandle(id, null)
  setDocOptions(id, { linked: false, diskDirty: false, diskModified: undefined })
}

// --- Trash ----------------------------------------------------------------

// Deleting moves a document to the Trash; it stays there for TRASH_DAYS days
// unless restored or deleted forever.
export const TRASH_DAYS = 30
const DAY = 24 * 60 * 60 * 1000

export function trashDoc(id) {
  setDocOptions(id, { deletedAt: Date.now() })
  return flush(id)
}

export function restoreDoc(id) {
  const doc = getDoc(id)
  if (!doc) return
  delete doc.deletedAt
  schedule(id)
  return flush(id)
}

export function emptyTrash() {
  return Promise.all(state.docs.filter((d) => d.deletedAt).map((d) => deleteDoc(d.id)))
}

function purgeOldTrash(now = Date.now()) {
  return Promise.all(
    state.docs.filter((d) => d.deletedAt && now - d.deletedAt > TRASH_DAYS * DAY).map((d) => deleteDoc(d.id)),
  )
}

// Delete forever.
export async function deleteDoc(id) {
  removeLocal(id)
  history?.forget(id)
  await enqueue(id, async () => {
    try {
      await backend.remove(id)
      dropRescue(id)
      announce({ type: 'delete', id })
    } catch (e) {
      console.error('Could not delete document', e)
    }
  })
  // Space was freed: documents that failed to save may fit now.
  await retryFailed()
}

// Apply a change another tab saved: { type: 'put', doc } or { type: 'delete', id }.
// If this tab has no unsaved edits to the document, take the other tab's
// version. If both tabs changed it, keep ours and save theirs as a separate
// copy, so nothing is lost.
export function handleRemoteChange(msg) {
  const dirty = (id) => timers.has(id) || state.status[id] !== 'saved'
  if (msg?.type === 'delete') {
    // Deleted elsewhere. Keep it if we have unsaved edits: our save recreates it.
    if (getDoc(msg.id) && !dirty(msg.id)) removeLocal(msg.id)
    return
  }
  const incoming = msg?.doc
  if (msg?.type !== 'put' || !isDoc(incoming)) return
  const local = getDoc(incoming.id)
  if (!local) {
    state.docs.unshift(incoming)
    state.status[incoming.id] = 'saved'
  } else if (!dirty(incoming.id)) {
    for (const key of Object.keys(local)) if (!(key in incoming)) delete local[key]
    Object.assign(local, incoming)
  } else if (incoming.content !== local.content) {
    createDoc(`${incoming.name} (changed in another tab)`, incoming.content)
  }
}

if (channel) channel.onmessage = (e) => handleRemoteChange(e.data)

if (typeof window !== 'undefined') {
  const leaving = () => {
    flushAll()
    return rescueUnsaved()
  }
  window.addEventListener('pagehide', leaving)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leaving()
  })
  window.addEventListener('beforeunload', (e) => {
    // Only ask "Leave site?" when something really can't be kept.
    const safe = leaving()
    if (!safe || Object.values(state.status).includes('error')) e.preventDefault()
  })
}

// --- Files ----------------------------------------------------------------

export class BinaryFileError extends Error {
  constructor(name) {
    super(`"${name}" doesn't look like a text file`)
    this.name = 'BinaryFileError'
  }
}

// Open a file from the user's disk and store it as a new document, keeping
// its encoding and line endings so saving writes it back the same way. With
// a file handle, the document stays linked to the file so Save writes to it.
export async function importFile(file, handle = null) {
  const decoded = decodeBytes(new Uint8Array(await file.arrayBuffer()))
  if (decoded.binary) throw new BinaryFileError(file.name)
  const { text, encoding, bom, eol } = decoded
  const doc = createDoc(file.name, text, { autoName: false, encoding, bom, eol })
  recordVersion(doc.id, 'opened')
  if (handle) {
    try {
      await linkFile(doc.id, handle, file.lastModified)
    } catch (e) {
      console.error('Could not remember the file', e)
    }
  }
  return doc
}

export function download(name, blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 0)
}

// The document as the bytes of a file, in its encoding and line endings.
export function docBlob(doc, encodingOverride) {
  const options = encodingOverride ? { ...plain(doc), encoding: encodingOverride, bom: false } : doc
  const { bytes, encoding, lossy } = encodeText(doc.content, options)
  const charset = encoding === 'windows-1252' ? 'windows-1252' : encoding
  return { blob: new Blob([bytes], { type: `text/plain;charset=${charset}` }), lossy }
}

// Save a document to the user's disk as a download. Returns { lossy: true }
// if it could not be written in its encoding and was saved as UTF-8 instead.
export function downloadDoc(doc) {
  const { blob, lossy } = docBlob(doc)
  download(doc.name || 'untitled.txt', blob)
  return { lossy }
}

// --- Backup ---------------------------------------------------------------

// The format id predates the name Plumb; keep it so older backups still import.
export const BACKUP_FORMAT = 'editor-backup'

// Links to files on disk only make sense in this browser, so they're left out.
const FILE_FIELDS = ['linked', 'diskDirty', 'diskModified', 'source']
function withoutFileLink(doc) {
  const d = plain(doc)
  for (const f of FILE_FIELDS) delete d[f]
  return d
}

export function exportBackup() {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    docs: state.docs.map(withoutFileLink),
  }
}

export function downloadBackup() {
  const date = new Date().toISOString().slice(0, 10)
  const json = JSON.stringify(exportBackup(), null, 1)
  download(`plumb-backup-${date}.json`, new Blob([json], { type: 'application/json' }))
}

// Add the documents from a backup. Never overwrites: a document that is
// already here unchanged is skipped; one that differs is added as a copy.
export function importBackup(data) {
  if (data?.format !== BACKUP_FORMAT || !Array.isArray(data.docs)) {
    throw new Error("This file isn't a Plumb backup.")
  }
  let added = 0
  let skipped = 0
  for (const d of data.docs) {
    if (!isDoc(d)) continue
    const existing = getDoc(d.id)
    const copyName = `${d.name} (from backup)`
    const alreadyHere = state.docs.some(
      (x) => x.content === d.content && (x.name === d.name || x.name === copyName),
    )
    if (alreadyHere) {
      skipped++
      continue
    }
    const doc = withoutFileLink(existing ? { ...d, id: crypto.randomUUID(), name: copyName } : d)
    state.docs.push(doc)
    schedule(doc.id)
    flush(doc.id)
    added++
  }
  return { added, skipped }
}
