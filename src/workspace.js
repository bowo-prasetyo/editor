// Folders opened from disk (Chrome, Edge and other Chromium browsers, with the
// File System Access API). The sidebar shows each one as a file tree; opening
// a file makes it a document linked to that file, so Save writes back to it.
//
// Each document opened from a folder remembers where it came from in
// `doc.source` ({ root, path }), so opening the same file again shows the
// same document, and it's filed in the document list under the folder's
// name and path (e.g. "my-app/src/components"), where the quick switcher
// finds it.
import { markRaw, reactive, shallowReactive } from 'vue'
import { prefs } from './prefs.js'
import {
  getDoc,
  importFile,
  linkFile,
  moveToFolder,
  recordVersion,
  requestPersistence,
  setDocOptions,
  state,
  storeHandle,
  storedHandle,
  updateDoc,
} from './store.js'
import { decodeBytes } from './textcodec.js'
import { editorSettings, parseEditorConfig, propertiesFor } from './editorconfig.js'

export const canOpenFolder = () => typeof globalThis.showDirectoryPicker === 'function'

const handleKey = (id) => `folder:${id}`
const isAbort = (e) => e?.name === 'AbortError'

// Each open folder, by id: { handle, permission: 'granted' | 'prompt' | 'denied' }.
// Handles are kept out of Vue's reactivity: a proxied handle can't be used.
export const roots = shallowReactive(new Map())

const workspaceFor = (id) => prefs.workspaces.find((w) => w.id === id)

async function permission(handle, { ask = false } = {}) {
  const opts = { mode: 'readwrite' }
  try {
    let p = (await handle.queryPermission?.(opts)) ?? 'granted'
    if (p !== 'granted' && ask) p = await handle.requestPermission(opts)
    return p
  } catch {
    return 'denied'
  }
}

function addRoot(id, handle, perm) {
  const root = reactive({ handle: markRaw(handle), permission: perm })
  roots.set(id, root)
  return root
}

// After a reload: find the folders' handles again. The browser asks for
// permission again before they can be read (see reconnect()).
export async function loadWorkspaces() {
  for (const w of prefs.workspaces) {
    if (roots.has(w.id)) continue
    const handle = await storedHandle(handleKey(w.id)).catch(() => null)
    if (handle) addRoot(w.id, handle, await permission(handle))
  }
}

// Ask for permission to read and write the folder again. Needs a click.
export async function reconnect(id) {
  const root = roots.get(id)
  if (!root) return false
  root.permission = await permission(root.handle, { ask: true })
  if (root.permission === 'granted') forgetListings(id)
  return root.permission === 'granted'
}

// Show the browser's folder picker and add the folder to the sidebar.
// Returns the workspace ({ id, name }), or null if cancelled.
export async function openFolder() {
  let handle
  try {
    handle = await globalThis.showDirectoryPicker({ id: 'editor-folder', mode: 'readwrite' })
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
  prefs.sidebar = true
  // Already open: just make sure we can use it.
  for (const w of prefs.workspaces) {
    const root = roots.get(w.id)
    if (root && (await root.handle.isSameEntry?.(handle))) {
      root.permission = 'granted'
      forgetListings(w.id)
      return w
    }
  }
  const w = { id: crypto.randomUUID(), name: handle.name }
  await storeHandle(handleKey(w.id), handle)
  addRoot(w.id, handle, 'granted')
  prefs.workspaces = [...prefs.workspaces, w]
  requestPersistence()
  return w
}

// Take a folder out of the sidebar. Documents opened from it stay, still
// linked to their files.
export async function closeFolder(id) {
  prefs.workspaces = prefs.workspaces.filter((w) => w.id !== id)
  delete prefs.expanded[id]
  roots.delete(id)
  forgetListings(id)
  await storeHandle(handleKey(id), null)
}

// --- Listing folders --------------------------------------------------------------

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// Folders first, then files, each in natural order.
export const sortEntries = (entries) =>
  [...entries].sort(
    (a, b) => (a.kind === b.kind ? 0 : a.kind === 'directory' ? -1 : 1) || collator.compare(a.name, b.name),
  )

export async function listDirectory(dir) {
  const out = []
  for await (const handle of dir.values()) out.push(markRaw(handle))
  return sortEntries(out)
}

// What's in each folder the tree has shown, read once and kept until
// refreshed: "rootId:path" -> [handle] (or { error }).
export const listings = shallowReactive(new Map())
const listingKey = (rootId, path) => `${rootId}:${path}`
export const getListing = (rootId, path) => listings.get(listingKey(rootId, path))

export async function loadListing(rootId, path, dir) {
  const key = listingKey(rootId, path)
  try {
    listings.set(key, await listDirectory(dir))
  } catch (e) {
    listings.set(key, { error: e })
  }
  return listings.get(key)
}

// Read folders again (all of a root's, or everything). The list of every
// file goes too, and is made again when next needed.
export function forgetListings(rootId = null) {
  for (const key of [...listings.keys()]) if (!rootId || key.startsWith(rootId + ':')) listings.delete(key)
  for (const key of [...editorConfigs.keys()]) if (!rootId || key.startsWith(rootId + ':')) editorConfigs.delete(key)
  forgetIndex(rootId)
}

// --- .editorconfig (see editorconfig.js) ------------------------------------------------

// "rootId:dir" -> parsed .editorconfig, or null where there's none.
const editorConfigs = new Map()

async function readEditorConfig(rootId, dirPath, dir) {
  const key = `${rootId}:${dirPath}`
  if (!editorConfigs.has(key)) {
    let config = null
    try {
      const file = await (await dir.getFileHandle('.editorconfig')).getFile()
      config = parseEditorConfig(await file.text())
    } catch {
      // none here (or unreadable)
    }
    editorConfigs.set(key, config)
  }
  return editorConfigs.get(key)
}

// What the folder's .editorconfig files say about a file (see
// editorSettings()), or null when they say nothing (or can't be read).
export async function editorConfigFor(rootId, path) {
  const root = roots.get(rootId)
  if (!root || root.permission !== 'granted') return null
  const dirs = path.split('/').slice(0, -1)
  const configs = []
  let dir = root.handle
  let dirPath = ''
  try {
    for (let i = 0; ; i++) {
      const config = await readEditorConfig(rootId, dirPath, dir)
      if (config) configs.push({ dir: dirPath, config })
      if (i === dirs.length) break
      dir = await dir.getDirectoryHandle(dirs[i])
      dirPath = joinPath(dirPath, dirs[i])
    }
  } catch {
    // a folder on the way went away: use what was found
  }
  if (!configs.length) return null
  const settings = editorSettings(propertiesFor(configs, path))
  return Object.keys(settings).length ? settings : null
}

// --- Every file in a folder (for the quick switcher and search) ----------------------

// Folders that hold tools' and builds' files rather than the project's own:
// left out of the list (the tree still shows them).
export const IGNORED_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'bower_components', 'dist', 'build', 'out', 'target',
  '.next', '.nuxt', '.svelte-kit', '.cache', '.parcel-cache', '.turbo', 'coverage', '__pycache__',
  '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache', '.gradle', '.idea', '.vs', 'vendor',
])
export const MAX_INDEXED = 20_000

// Every file under `dir`, as { path, handle }, folders first at each level,
// skipping IGNORED_DIRS. Stops after `limit` files: { files, truncated }.
export async function walkFiles(dir, { limit = MAX_INDEXED, ignore = IGNORED_DIRS, signal } = {}) {
  const files = []
  const queue = [['', dir]]
  while (queue.length) {
    if (signal?.aborted) break
    const [path, handle] = queue.shift()
    let entries
    try {
      entries = await listDirectory(handle)
    } catch {
      continue // unreadable: skip it
    }
    for (const e of entries) {
      const p = joinPath(path, e.name)
      if (e.kind === 'directory') {
        if (!ignore.has(e.name)) queue.push([p, e])
      } else {
        files.push({ path: p, handle: e })
        if (files.length >= limit) return { files, truncated: true }
      }
    }
  }
  return { files, truncated: false }
}

// rootId -> { files: [{ path, handle }], truncated, ready } while being made
// and after. Made once per folder, and again after a refresh.
export const fileIndex = shallowReactive(new Map())
const building = new Map() // rootId -> Promise

export function forgetIndex(rootId = null) {
  for (const id of [...fileIndex.keys()]) if (!rootId || id === rootId) fileIndex.delete(id)
  for (const id of [...building.keys()]) if (!rootId || id === rootId) building.delete(id)
}

// The list of files in an open folder we may read, made if needed.
export function ensureIndex(rootId) {
  const root = roots.get(rootId)
  if (!root || root.permission !== 'granted') return Promise.resolve(null)
  if (fileIndex.get(rootId)?.ready) return Promise.resolve(fileIndex.get(rootId))
  if (!building.has(rootId)) {
    fileIndex.set(rootId, { files: [], truncated: false, ready: false })
    const job = walkFiles(root.handle).then((r) => {
      // Ignore a list made for a folder that was refreshed or closed meanwhile.
      if (building.get(rootId) !== job) return fileIndex.get(rootId)
      const entry = { ...r, ready: true }
      fileIndex.set(rootId, entry)
      return entry
    })
    building.set(rootId, job)
  }
  return building.get(rootId)
}

// Lists for every open folder we may read.
export const ensureAllIndexes = () => Promise.all(prefs.workspaces.map((w) => ensureIndex(w.id)))

// --- Expanded folders in the tree ------------------------------------------------------

export const isExpanded = (rootId, path) => path === '' || (prefs.expanded[rootId] ?? []).includes(path)

export function setExpanded(rootId, path, open) {
  const list = (prefs.expanded[rootId] ?? []).filter((p) => p !== path && (open || !p.startsWith(path + '/')))
  prefs.expanded[rootId] = open ? [...list, path] : list
}

// --- Opening files ----------------------------------------------------------------

export const joinPath = (dir, name) => (dir ? `${dir}/${name}` : name)

// The document-list folder for a file: the root's name and the file's folders.
export const docFolder = (rootName, path) => [rootName, ...path.split('/').slice(0, -1)].join('/')

export const findWorkspaceDoc = (rootId, path) =>
  state.docs.find((d) => !d.deletedAt && d.source?.root === rootId && d.source.path === path)

// Bring a document up to date with its file, if the file changed on disk
// since it was read or saved. Returns:
//   'same'      nothing to do
//   'reloaded'  the file's text was taken (undoable; the old text is kept as a version)
//   'conflict'  both changed: the document's unsaved changes are kept (saving asks first)
export async function refreshFromDisk(doc, file, handle) {
  if (!doc.diskModified || file.lastModified <= doc.diskModified) return 'same'
  if (doc.diskDirty) return 'conflict'
  const decoded = decodeBytes(new Uint8Array(await file.arrayBuffer()))
  if (decoded.binary) return 'same'
  if (decoded.text !== doc.content) {
    await recordVersion(doc.id, 'auto')
    updateDoc(doc.id, { content: decoded.text })
  }
  setDocOptions(doc.id, { encoding: decoded.encoding, bom: decoded.bom, eol: decoded.eol })
  await linkFile(doc.id, handle, file.lastModified)
  return 'reloaded'
}

// Open the file at `path` in a folder: its document if it has one (brought
// up to date with the file), or a new document linked to it.
// Returns { doc, refreshed } where refreshed is what refreshFromDisk() said.
// Throws BinaryFileError for files that aren't text.
export async function openWorkspaceFile(rootId, path, handle) {
  const file = await handle.getFile()
  const existing = findWorkspaceDoc(rootId, path)
  if (existing) return { doc: existing, refreshed: await refreshFromDisk(existing, file, handle) }
  const doc = await importFile(file, handle)
  setDocOptions(doc.id, { source: { root: rootId, path } })
  moveToFolder(doc.id, docFolder(workspaceFor(rootId)?.name ?? '', path))
  requestPersistence()
  return { doc: getDoc(doc.id), refreshed: 'same' }
}

// --- New files and folders -----------------------------------------------------------

export function checkEntryName(name) {
  const n = String(name ?? '').trim()
  if (!n) return 'Type a name.'
  if (n === '.' || n === '..' || /[/\\]/.test(n)) return 'A name can’t be “.” or “..”, or contain / or \\.'
  return ''
}

async function exists(dir, name) {
  for (const get of ['getFileHandle', 'getDirectoryHandle']) {
    try {
      await dir[get](name)
      return true
    } catch (e) {
      if (e?.name !== 'NotFoundError' && e?.name !== 'TypeMismatchError') throw e
    }
  }
  return false
}

// Create an empty file or folder in `dir` (at `dirPath` in the root), never
// replacing one that's there. Returns its handle.
export async function createEntry(rootId, dir, dirPath, name, kind) {
  const problem = checkEntryName(name)
  if (problem) throw new Error(problem)
  name = name.trim()
  if (await exists(dir, name)) throw new Error(`“${name}” already exists here.`)
  const handle =
    kind === 'directory' ? await dir.getDirectoryHandle(name, { create: true }) : await dir.getFileHandle(name, { create: true })
  await loadListing(rootId, dirPath, dir)
  forgetIndex(rootId)
  return markRaw(handle)
}
