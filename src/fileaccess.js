// Saving back to the file a document came from, using the File System Access
// API (Chrome, Edge and other Chromium browsers). Elsewhere, saving falls
// back to a download.
import { ENCODINGS } from './textcodec.js'
import { docBlob, downloadDoc, getDoc, getFileHandle, linkFile, recordVersion, setDocOptions, state } from './store.js'

// (globalThis is window in a page.)
export const canSaveInPlace = () =>
  typeof globalThis.showOpenFilePicker === 'function' && typeof globalThis.showSaveFilePicker === 'function'

const isAbort = (e) => e?.name === 'AbortError'

// Read/write permission for a handle. Asking needs a user gesture (a click or
// a key press), which Save always comes from.
async function ensureWritable(handle) {
  const opts = { mode: 'readwrite' }
  if ((await handle.queryPermission?.(opts)) === 'granted') return true
  return (await handle.requestPermission?.(opts)) === 'granted'
}

// Show the browser's "Open" picker. Returns [{ file, handle }], or [] if cancelled.
export async function pickFiles() {
  try {
    const handles = await globalThis.showOpenFilePicker({ multiple: true, id: 'editor-open' })
    return Promise.all(handles.map(async (handle) => ({ file: await handle.getFile(), handle })))
  } catch (e) {
    if (isAbort(e)) return []
    throw e
  }
}

// File handles for dropped files, where the browser offers them. This must be
// called while the drop event is being handled: the items go away after.
export function droppedHandles(dataTransfer) {
  const items = [...(dataTransfer?.items ?? [])].filter((i) => i.kind === 'file')
  if (!items.length || typeof items[0].getAsFileSystemHandle !== 'function') return null
  return Promise.all(items.map((i) => i.getAsFileSystemHandle().catch(() => null)))
}


// Bytes to write, asking what to do if the text can't be written in the
// file's encoding. Returns null if the user cancels.
function bytesFor(doc, confirmFn) {
  let { blob, lossy } = docBlob(doc)
  if (!lossy) return blob
  const name = ENCODINGS[doc.encoding] ?? doc.encoding
  if (!confirmFn(`Some characters can't be written as ${name}.\n\nSave the file as UTF-8 instead?`)) return null
  setDocOptions(doc.id, { encoding: 'utf-8', bom: false })
  return docBlob(doc).blob
}

async function write(handle, blob) {
  const w = await handle.createWritable()
  try {
    await w.write(blob)
    await w.close()
  } catch (e) {
    await w.abort?.().catch(() => {})
    throw e
  }
  return (await handle.getFile()).lastModified
}

// Documents being written to their files right now. A change on disk
// reported meanwhile is our own write (see livereload.js).
const writing = new Set()
export const isWriting = (id) => writing.has(id)

// Save a document.
//   - Linked to a file and allowed to write it: write the file in place.
//   - Otherwise, where the browser can: ask where to save it, then link it.
//   - Elsewhere: download a copy.
// `saveAs` always asks where to save. Returns one of:
//   { result: 'saved', name } | { result: 'downloaded', lossy } | { result: 'cancelled' }
export async function saveDoc(doc, { saveAs = false, confirm: confirmFn = (m) => globalThis.confirm(m) } = {}) {
  if (!canSaveInPlace()) return { result: 'downloaded', ...downloadDoc(doc) }

  let handle = saveAs ? null : await getFileHandle(doc.id)
  if (handle) {
    if (!(await ensureWritable(handle))) return { result: 'cancelled' }
    // Someone else changed the file since we read or wrote it: don't
    // silently overwrite their changes.
    let current = null
    try {
      current = await handle.getFile()
    } catch (e) {
      // The file was moved or deleted: ask where to save instead.
      if (e?.name !== 'NotFoundError') throw e
      handle = null
    }
    if (current && doc.diskModified && current.lastModified > doc.diskModified) {
      const ok = confirmFn(
        `"${current.name}" was changed on disk after you opened it.\n\nReplace it with this version?`,
      )
      if (!ok) return { result: 'cancelled' }
    }
  }
  if (!handle) {
    try {
      handle = await globalThis.showSaveFilePicker({ suggestedName: doc.name || 'untitled.txt', id: 'editor-save' })
    } catch (e) {
      if (isAbort(e)) return { result: 'cancelled' }
      throw e
    }
  }

  const blob = bytesFor(doc, confirmFn)
  if (!blob) return { result: 'cancelled' }
  writing.add(doc.id)
  try {
    const lastModified = await write(handle, blob)
    await linkFile(doc.id, handle, lastModified)
  } finally {
    writing.delete(doc.id)
  }
  recordVersion(doc.id, 'saved')
  if (handle.name && handle.name !== doc.name) setDocOptions(doc.id, { name: handle.name, autoName: false })
  return { result: 'saved', name: handle.name }
}

// Documents linked to files that have changes not saved to them.
export const unsavedToDisk = () => state.docs.filter((d) => d.linked && d.diskDirty && !d.deletedAt)

// Save every document with changes not saved to its file, one after the
// other (each may ask about a file changed on disk). `prepare(doc)` runs
// first for each one (whitespace fixes). Returns { saved, cancelled, failed: [names] }.
export async function saveAllToFiles({ prepare, confirm } = {}) {
  const out = { saved: 0, cancelled: 0, failed: [] }
  for (const { id } of unsavedToDisk()) {
    try {
      await prepare?.(getDoc(id))
      const r = await saveDoc(getDoc(id), confirm ? { confirm } : {})
      if (r.result === 'saved') out.saved++
      else out.cancelled++
    } catch (e) {
      console.error(e)
      out.failed.push(getDoc(id)?.name ?? id)
    }
  }
  return out
}
