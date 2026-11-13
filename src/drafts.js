// Drafts: pinning, and "Save to folder…", which turns a draft into a file in
// an open folder. See docs/files-and-drafts.md, "Drafts".
import { prefs } from './prefs.js'
import {
  docBlob,
  getDoc,
  getFileHandle,
  linkFile,
  recordVersion,
  relinkFile,
  setDocOptions,
  unlinkFile,
} from './store.js'
import { checkEntryName, docFolder, forgetListings, roots } from './workspace.js'

export const togglePin = (id) => setDocOptions(id, { pinned: !getDoc(id)?.pinned || undefined })

// Open folders a draft can be saved to: [{ id, name }].
export const saveTargets = () =>
  prefs.workspaces.filter((w) => roots.get(w.id)?.permission === 'granted').map((w) => ({ id: w.id, name: w.name }))

// "notes/todo.md" -> ['notes', 'todo.md'], or throws with what's wrong.
export function splitPath(path) {
  const parts = String(path ?? '').replace(/\\/g, '/').split('/').map((p) => p.trim()).filter(Boolean)
  if (!parts.length) throw new Error('Type a file name.')
  for (const p of parts) {
    const problem = checkEntryName(p)
    if (problem) throw new Error(problem)
  }
  return parts
}

const isNotFound = (e) => e?.name === 'NotFoundError'

// Save the draft `id` as the file `path` in the open folder `rootId`, and
// make it that file. Missing subfolders are created; an existing file is
// never replaced. The text is written in the draft's encoding and line
// endings. Returns what undoSaveToFolder() needs.
export async function saveDraftToFolder(id, rootId, path) {
  const draft = getDoc(id)
  if (!draft || draft.kind === 'file') throw new Error('Only a draft can be saved to a folder.')
  const root = roots.get(rootId)
  const folder = prefs.workspaces.find((w) => w.id === rootId)
  if (!root || !folder) throw new Error('That folder isn’t open.')
  const parts = splitPath(path)
  const name = parts.at(-1)
  const filePath = parts.join('/')

  let dir = root.handle
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true })
  try {
    await dir.getFileHandle(name)
    throw new Error(`“${filePath}” already exists in “${folder.name}”.`)
  } catch (e) {
    if (e?.name === 'TypeMismatchError') throw new Error(`“${filePath}” is a folder in “${folder.name}”.`)
    if (!isNotFound(e)) throw e
  }
  const handle = await dir.getFileHandle(name, { create: true })
  const { blob } = docBlob(draft)
  const w = await handle.createWritable()
  try {
    await w.write(blob)
    await w.close()
  } catch (e) {
    await w.abort?.().catch(() => {})
    await dir.removeEntry?.(name).catch(() => {})
    throw e
  }
  const written = await handle.getFile()

  const before = {
    kind: draft.kind,
    name: draft.name,
    autoName: draft.autoName,
    folder: draft.folder,
    pinned: draft.pinned,
    linked: draft.linked,
    diskDirty: draft.diskDirty,
    diskModified: draft.diskModified,
    source: draft.source,
  }
  const oldHandle = draft.linked ? await getFileHandle(id).catch(() => null) : null
  setDocOptions(id, {
    kind: 'file',
    source: { root: rootId, path: filePath },
    folder: docFolder(folder.name, filePath),
    name,
    autoName: false,
    pinned: undefined,
    origin: undefined,
    copyOf: undefined,
  })
  await linkFile(id, handle, written.lastModified)
  await recordVersion(id, 'saved')
  forgetListings(rootId)
  return { id, rootId, dir, name, path: filePath, lastModified: written.lastModified, size: written.size, before, oldHandle }
}

// Undo "Save to folder…": the file record becomes the draft it was. The file
// is removed only if it's still exactly what was written (not changed since,
// by Plumb or anything else); otherwise it stays on disk. Returns whether the
// file was removed.
export async function undoSaveToFolder(saved) {
  const { id, rootId, dir, name, lastModified, size, before, oldHandle } = saved
  if (!getDoc(id)) return false
  setDocOptions(id, { ...before, origin: undefined })
  if (before.linked && oldHandle) await relinkFile(id, oldHandle)
  else await unlinkFile(id)
  let removed = false
  try {
    const file = await (await dir.getFileHandle(name)).getFile()
    if (file.lastModified === lastModified && file.size === size) {
      await dir.removeEntry(name)
      removed = true
    }
  } catch {
    // already gone, or can't be read: leave it
  }
  forgetListings(rootId)
  return removed
}
