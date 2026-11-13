// Closing a folder, and opening it again. See docs/files-and-drafts.md,
// "Closing a folder".
//
//   - Closing a folder with unsaved files asks (CloseFolderDialog.vue):
//     save them all to disk, keep them as drafts, or cancel.
//   - Drafts kept that way remember where they came from (`origin`). When
//     the same folder is opened again, the sidebar offers to put the edits
//     back into their files.
import { reactive } from 'vue'
import { getDoc, relinkFile, linkFile, setDocOptions, state } from './store.js'
import { saveAllToFiles } from './fileaccess.js'
import { decodeBytes } from './textcodec.js'
import { diskNotices } from './livereload.js'
import { docFolder, forgetOrigin, onFolderOpened, originHandle, resolveFile } from './workspace.js'
import { prefs } from './prefs.js'

// The folder's files with changes not saved to disk.
export const unsavedIn = (rootId) =>
  state.docs.filter((d) => d.kind === 'file' && d.source?.root === rootId && d.diskDirty && !d.deletedAt)

// "Save all to disk": write the folder's unsaved files. Returns what
// saveAllToFiles returns, plus `left`: the files still not saved (cancelled,
// or failed). The folder should only be closed when none are left.
export async function saveFolderFiles(rootId, options = {}) {
  const r = await saveAllToFiles({ ...options, only: (d) => d.source?.root === rootId })
  return { ...r, left: unsavedIn(rootId) }
}

// --- Opening the folder again ------------------------------------------------------

// Drafts that came from a folder just opened: folder id -> [draft id].
export const returning = reactive({})

// Did this draft come from the folder at `handle` (named `name`)? The folder
// is recognised by its handle; drafts kept before handles were remembered
// (see migrate.js) are matched by the folder's name.
async function cameFrom(draft, handle, name) {
  const o = draft.origin
  if (o.root) {
    const h = await originHandle(o.root).catch(() => null)
    if (h) return !!(await h.isSameEntry?.(handle).catch(() => false))
  }
  return o.folder === name
}

export async function findReturning(w, handle) {
  const ids = []
  for (const d of state.docs) {
    if (d.kind === 'file' || !d.origin || d.deletedAt) continue
    if (await cameFrom(d, handle, w.name)) ids.push(d.id)
  }
  if (ids.length) returning[w.id] = ids
  else delete returning[w.id]
  return ids
}
onFolderOpened(findReturning)

export const dismissReturning = (rootId) => void delete returning[rootId]

// "Put the edits back": each draft becomes its file again, with its edits
// still unsaved. A file that changed on disk meanwhile gets the usual
// "changed on disk" notice (and Save asks before replacing it); a file that's
// gone leaves its draft as it is. Returns { back, changed, missing }.
export async function putBack(rootId) {
  const out = { back: 0, changed: 0, missing: 0 }
  const name = prefs.workspaces.find((w) => w.id === rootId)?.name ?? ''
  const oldRoots = new Set()
  for (const id of returning[rootId] ?? []) {
    const draft = getDoc(id)
    if (!draft?.origin || draft.kind === 'file') continue
    const { path, root } = draft.origin
    let handle, file
    try {
      handle = await resolveFile(rootId, path)
      file = await handle.getFile()
    } catch {
      setDocOptions(id, { origin: { ...draft.origin, missing: true } })
      out.missing++
      continue
    }
    if (root) oldRoots.add(root)
    const decoded = decodeBytes(new Uint8Array(await file.arrayBuffer()))
    const same = !decoded.binary && decoded.text === draft.content
    const changed = !same && (!draft.diskModified || file.lastModified > draft.diskModified)
    setDocOptions(id, {
      kind: 'file',
      source: { root: rootId, path },
      origin: undefined,
      folder: docFolder(name, path),
      name: path.split('/').pop(),
      autoName: false,
    })
    if (same) {
      await linkFile(id, handle, file.lastModified) // nothing unsaved after all
    } else {
      // Unsaved edits. Without a known date for the file as it was, Save
      // must still ask before replacing it.
      setDocOptions(id, { linked: true, diskDirty: true, diskModified: draft.diskModified || 1 })
      await relinkFile(id, handle)
      if (changed) {
        diskNotices[id] = { kind: 'changed' }
        out.changed++
      }
    }
    out.back++
  }
  delete returning[rootId]
  // A remembered folder no draft points to any more can be forgotten.
  for (const root of oldRoots) {
    if (!state.docs.some((d) => d.origin?.root === root)) await forgetOrigin(root)
  }
  return out
}
