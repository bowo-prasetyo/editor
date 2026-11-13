// Files opened on their own (Open files…, dropped on the page, "Open with"
// the installed app, or a draft saved to a file): a Recent files list on the
// start page. Like files in folders, they're stored without their text when
// they have no unsaved changes. See docs/files-and-drafts.md.
import { deleteDoc, getDoc, getFileHandle, importFile, setDocOptions, state } from './store.js'
import { refreshFromDisk, takeText } from './workspace.js'

export const MAX_RECENT_FILES = 20

export const isRecentFile = (d) => d?.kind === 'file' && !d.source && !d.deletedAt

// Most recently opened first.
export function recentFiles() {
  const when = (d) => d.openedAt ?? d.updatedAt ?? 0
  return state.docs.filter(isRecentFile).sort((a, b) => when(b) - when(a))
}

// Keep the 20 most recent. A file with unsaved changes never drops out; the
// others beyond 20 go, with their history (their text is on disk).
export async function pruneRecentFiles(max = MAX_RECENT_FILES) {
  const extra = recentFiles().slice(max).filter((d) => !d.diskDirty)
  for (const d of extra) await deleteDoc(d.id)
  return extra.length
}

export const touchRecentFile = (id) => isRecentFile(getDoc(id)) && setDocOptions(id, { openedAt: Date.now() })

// Take a file off the list. Only one with nothing unsaved: its text is on disk.
export async function forgetRecentFile(id) {
  const d = getDoc(id)
  if (!isRecentFile(d) || d.diskDirty) return false
  await deleteDoc(id)
  return true
}

// The recent file for `handle`, if it's already in the list.
async function findByHandle(handle) {
  for (const d of recentFiles()) {
    const h = await getFileHandle(d.id).catch(() => null)
    if (h && (await h.isSameEntry?.(handle).catch(() => false))) return d
  }
  return null
}

// Open a file with its handle: the same record as before if it was opened
// already (brought up to date with the file, as when reopening a folder's
// file), else a new one. Returns the document.
export async function openSingleFile(file, handle) {
  const existing = await findByHandle(handle)
  if (existing) {
    if (existing.unread) await takeText(existing.id, file, handle)
    else await refreshFromDisk(existing, file, handle)
    touchRecentFile(existing.id)
    return getDoc(existing.id)
  }
  const doc = await importFile(file, handle, { kind: 'file', openedAt: Date.now() })
  await pruneRecentFiles()
  return getDoc(doc.id)
}
