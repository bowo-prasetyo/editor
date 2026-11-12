import { reactive } from 'vue'
import { decodeBytes, encodeText } from './textcodec.js'
import { DEFAULT_NAME, nameFromContent } from './naming.js'
import { extension } from './filetype.js'

// All documents live in localStorage — no server involved.
//
// Each document is stored under its own key ("editor.doc.<id>") so that:
//   - one document too large for the storage quota cannot block saving others,
//   - typing re-serialises only the document being edited,
//   - two tabs editing different documents never overwrite each other.
const PREFIX = 'editor.doc.'
const LEGACY_KEY = 'editor.documents.v1'
const SAVE_DELAY = 400

// status[id] is 'saved' | 'pending' | 'error'
export const state = reactive({ docs: [], status: {} })

const timers = new Map()

function storage() {
  return globalThis.localStorage
}

function parse(json) {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

function isDoc(d) {
  return d && typeof d.id === 'string' && typeof d.content === 'string'
}

function write(doc) {
  storage().setItem(PREFIX + doc.id, JSON.stringify(doc))
}

// --- Loading and migration ------------------------------------------------

// Move documents from the old single-key format one at a time, shrinking the
// old entry as we go so we never need room for two full copies. Anything that
// does not fit stays in the old entry and is loaded from there (as unsaved).
function migrate() {
  const legacy = parse(storage().getItem(LEGACY_KEY))
  if (!Array.isArray(legacy)) return []
  let remaining = legacy.filter(isDoc)
  for (const doc of [...remaining]) {
    if (!storage().getItem(PREFIX + doc.id)) {
      try {
        write(doc)
      } catch {
        break
      }
    }
    remaining = remaining.filter((d) => d !== doc)
    if (remaining.length) storage().setItem(LEGACY_KEY, JSON.stringify(remaining))
    else storage().removeItem(LEGACY_KEY)
  }
  return remaining
}

function dropFromLegacy(id) {
  const legacy = parse(storage().getItem(LEGACY_KEY))
  if (!Array.isArray(legacy)) return
  const rest = legacy.filter((d) => d?.id !== id)
  if (rest.length === legacy.length) return
  if (rest.length) storage().setItem(LEGACY_KEY, JSON.stringify(rest))
  else storage().removeItem(LEGACY_KEY)
}

function init() {
  state.docs = []
  state.status = {}
  try {
    const unmigrated = migrate()
    const s = storage()
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i)
      if (!key?.startsWith(PREFIX)) continue
      const doc = parse(s.getItem(key))
      if (isDoc(doc)) {
        state.docs.push(doc)
        state.status[doc.id] = 'saved'
      }
    }
    for (const doc of unmigrated) {
      if (getDoc(doc.id)) continue
      state.docs.push(doc)
      state.status[doc.id] = 'error'
    }
  } catch (e) {
    console.error('Could not load documents', e)
  }
}

// --- Saving ---------------------------------------------------------------

function flush(id) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  const doc = getDoc(id)
  if (!doc) return
  try {
    write(doc)
    state.status[id] = 'saved'
    dropFromLegacy(id)
  } catch (e) {
    console.error(`Could not save "${doc.name}"`, e)
    state.status[id] = 'error'
  }
}

function schedule(id) {
  state.status[id] = 'pending'
  clearTimeout(timers.get(id))
  timers.set(id, setTimeout(() => flush(id), SAVE_DELAY))
}

// Save everything right now (page hidden, closing, leaving the editor).
export function flushAll() {
  for (const id of [...timers.keys()]) flush(id)
}

// Try again to save documents whose last save failed.
export function retryFailed() {
  for (const [id, s] of Object.entries(state.status)) if (s === 'error') flush(id)
}

export function hasUnsaved() {
  return Object.values(state.status).some((s) => s !== 'saved')
}

// --- Public API -----------------------------------------------------------

// extra: { autoName, eol, encoding, bom } and anything else to keep on the doc.
// A new blank document is named from its first line until the user renames it.
export function createDoc(name = DEFAULT_NAME, content = '', extra = { autoName: name === DEFAULT_NAME }) {
  const doc = { id: crypto.randomUUID(), name, content, updatedAt: Date.now(), ...extra }
  state.docs.unshift(doc)
  flush(doc.id)
  return doc
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
  Object.assign(doc, patch, { updatedAt: Date.now() })
  schedule(id)
}

function removeLocal(id) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  delete state.status[id]
  const i = state.docs.findIndex((d) => d.id === id)
  if (i !== -1) state.docs.splice(i, 1)
}

// Change a document's view settings (wrap, spell check) without marking its
// content as edited.
export function setDocOptions(id, patch) {
  const doc = getDoc(id)
  if (!doc) return
  Object.assign(doc, patch)
  schedule(id)
}

// --- Trash ----------------------------------------------------------------

// Deleting moves a document to the Trash; it stays there for TRASH_DAYS days
// unless restored or deleted forever.
export const TRASH_DAYS = 30
const DAY = 24 * 60 * 60 * 1000

export function trashDoc(id) {
  setDocOptions(id, { deletedAt: Date.now() })
  flush(id)
}

export function restoreDoc(id) {
  const doc = getDoc(id)
  if (!doc) return
  delete doc.deletedAt
  schedule(id)
  flush(id)
}

export function emptyTrash() {
  for (const d of [...state.docs]) if (d.deletedAt) deleteDoc(d.id)
}

function purgeOldTrash(now = Date.now()) {
  for (const d of [...state.docs]) if (d.deletedAt && now - d.deletedAt > TRASH_DAYS * DAY) deleteDoc(d.id)
}

// Delete forever.
export function deleteDoc(id) {
  removeLocal(id)
  try {
    storage().removeItem(PREFIX + id)
    dropFromLegacy(id)
  } catch (e) {
    console.error('Could not delete document', e)
  }
  // Space was freed: documents that failed to save may fit now.
  retryFailed()
}

// --- Other tabs -----------------------------------------------------------

// Apply a change another tab made to localStorage. If this tab has no unsaved
// edits to the document, take the other tab's version. If both tabs changed it,
// keep ours and save theirs as a separate copy, so nothing is lost.
export function handleStorageEvent(e) {
  const dirty = (id) => timers.has(id) || state.status[id] === 'error'
  if (e.key === null) {
    // Storage cleared elsewhere: drop what was saved, keep unsaved edits.
    for (const d of [...state.docs]) if (!dirty(d.id)) removeLocal(d.id)
    return
  }
  if (!e.key.startsWith(PREFIX)) return
  const id = e.key.slice(PREFIX.length)
  const local = getDoc(id)
  const incoming = e.newValue == null ? null : parse(e.newValue)

  if (!incoming) {
    // Deleted elsewhere. Keep it if we have unsaved edits: our save recreates it.
    if (local && !dirty(id)) removeLocal(id)
    return
  }
  if (!isDoc(incoming)) return
  if (!local) {
    state.docs.unshift(incoming)
    state.status[id] = 'saved'
  } else if (!dirty(id)) {
    Object.assign(local, incoming)
  } else if (incoming.content !== local.content) {
    createDoc(`${incoming.name} (changed in another tab)`, incoming.content)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', handleStorageEvent)
  window.addEventListener('pagehide', flushAll)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll()
  })
  window.addEventListener('beforeunload', (e) => {
    flushAll()
    if (hasUnsaved()) e.preventDefault()
  })
}

init()
purgeOldTrash()

// --- Files ----------------------------------------------------------------

export class BinaryFileError extends Error {
  constructor(name) {
    super(`"${name}" doesn't look like a text file`)
    this.name = 'BinaryFileError'
  }
}

// Open a file from the user's disk and store it as a new document, keeping
// its encoding and line endings so saving writes it back the same way.
export async function importFile(file) {
  const decoded = decodeBytes(new Uint8Array(await file.arrayBuffer()))
  if (decoded.binary) throw new BinaryFileError(file.name)
  const { text, encoding, bom, eol } = decoded
  return createDoc(file.name, text, { autoName: false, encoding, bom, eol })
}

function download(name, blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 0)
}

// Save a document to the user's disk as a download. Returns { lossy: true }
// if it could not be written in its encoding and was saved as UTF-8 instead.
export function downloadDoc(doc) {
  const { bytes, encoding, lossy } = encodeText(doc.content, doc)
  const charset = encoding === 'windows-1252' ? 'windows-1252' : encoding
  download(doc.name || 'untitled.txt', new Blob([bytes], { type: `text/plain;charset=${charset}` }))
  return { lossy }
}

// --- Backup ---------------------------------------------------------------

export const BACKUP_FORMAT = 'editor-backup'

export function exportBackup() {
  return { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), docs: state.docs }
}

export function downloadBackup() {
  const date = new Date().toISOString().slice(0, 10)
  const json = JSON.stringify(exportBackup(), null, 1)
  download(`editor-backup-${date}.json`, new Blob([json], { type: 'application/json' }))
}

// Add the documents from a backup. Never overwrites: a document that is
// already here unchanged is skipped; one that differs is added as a copy.
export function importBackup(data) {
  if (data?.format !== BACKUP_FORMAT || !Array.isArray(data.docs)) {
    throw new Error("This file isn't an editor backup.")
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
    const doc = existing ? { ...d, id: crypto.randomUUID(), name: copyName } : { ...d }
    state.docs.push(doc)
    flush(doc.id)
    added++
  }
  return { added, skipped }
}
