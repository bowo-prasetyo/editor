// Live reload: documents linked to files follow changes made to those files
// on disk (by another editor, a formatter, git…).
//
//   - Files in open folders are watched (see watchRoot() in workspace.js):
//     a change is picked up as it happens.
//   - Other linked files, and every linked file in browsers that can't
//     watch, are checked when the window comes back into focus and when a
//     document is shown (only the file's size and date, unless it changed).
//
// A document with no changes unsaved to its file reloads by itself (one
// undoable edit; the text it replaced is kept as a version). One with
// unsaved changes is never touched: a notice offers to reload (keeping the
// unsaved text as a version first) or to keep it (Save then asks before
// replacing the file). A file deleted on disk gets a notice too; a file
// moved or renamed within its folder takes its document along.
import { reactive } from 'vue'
import { prefs } from './prefs.js'
import {
  getDoc,
  getFileHandle,
  linkFile,
  moveToFolder,
  recordVersion,
  relinkFile,
  setDocOptions,
  updateDoc,
} from './store.js'
import { isWriting } from './fileaccess.js'
import { decodeBytes, fileFormat } from './textcodec.js'
import { docFolder, findWorkspaceDoc, onFileEvent, refreshFromDisk, resolveFile } from './workspace.js'

// Documents whose file changed or went away in a way that needs a choice:
// doc id -> { kind: 'changed' | 'deleted' }.
export const diskNotices = reactive({})

// Called with a document reloaded by itself (to say so if it's on screen).
let onReloaded = () => {}
export const setReloadedHandler = (fn) => (onReloaded = fn)

const isNotFound = (e) => e?.name === 'NotFoundError'

// Check one document against its file, and reload it or raise a notice.
// Returns 'same' | 'reloaded' | 'changed' | 'deleted' | 'skipped'.
export async function checkDoc(id) {
  const doc = getDoc(id)
  // A file not read yet has nothing to compare: it's read fresh when shown.
  if (!doc?.linked || doc.deletedAt || doc.unread) return 'skipped'
  // Our own save in progress: look again once it's done.
  if (isWriting(id)) return later(id), 'skipped'
  const handle = await getFileHandle(id).catch(() => null)
  if (!handle) return 'skipped'
  let file
  try {
    file = await handle.getFile()
  } catch (e) {
    if (isNotFound(e)) {
      diskNotices[id] = { kind: 'deleted' }
      return 'deleted'
    }
    return 'skipped' // no permission yet (after a reload): nothing to say
  }
  if (diskNotices[id]?.kind === 'deleted') delete diskNotices[id]
  const fresh = getDoc(id)
  if (!fresh) return 'skipped'
  // With live reload off, even a document with nothing unsaved only gets a notice.
  if (!prefs.liveReload && !fresh.diskDirty && fresh.diskModified && file.lastModified > fresh.diskModified) {
    const decoded = decodeBytes(new Uint8Array(await file.arrayBuffer()))
    if (!decoded.binary && decoded.text === fresh.content) {
      // Same text; the encoding or line endings may have changed.
      setDocOptions(id, fileFormat(decoded))
      await linkFile(id, handle, file.lastModified)
      return 'same'
    }
    diskNotices[id] = { kind: 'changed' }
    return 'changed'
  }
  const r = await refreshFromDisk(fresh, file, handle)
  if (r === 'reloaded') {
    delete diskNotices[id]
    onReloaded(getDoc(id))
    return 'reloaded'
  }
  if (r === 'conflict') {
    diskNotices[id] = { kind: 'changed' }
    return 'changed'
  }
  if (diskNotices[id]?.kind === 'changed' && !getDoc(id)?.diskDirty) delete diskNotices[id]
  return 'same'
}

// Several changes to a file come in a burst (a save is a few events): look
// once things settle.
const timers = new Map()
function later(id, ms = 150) {
  clearTimeout(timers.get(id))
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id)
      checkDoc(id).catch((e) => console.error('Could not check the file', e))
    }, ms),
  )
}

// The user chose to take the file's text: the document's own text is kept
// as a version first, so nothing is lost.
export async function reloadFromDisk(id) {
  const doc = getDoc(id)
  const handle = doc && (await getFileHandle(id))
  if (!handle) return false
  const file = await handle.getFile()
  const decoded = decodeBytes(new Uint8Array(await file.arrayBuffer()))
  if (decoded.binary) return false
  await recordVersion(id, 'manual', 'Before reloading from disk')
  if (decoded.text !== doc.content) updateDoc(id, { content: decoded.text })
  setDocOptions(id, fileFormat(decoded))
  await linkFile(id, handle, file.lastModified)
  delete diskNotices[id]
  return true
}

// The user chose to keep their text. Saving still asks before replacing
// the file, since it changed after it was read.
export const keepMine = (id) => void delete diskNotices[id]

// Check every linked document in an open tab (when the window comes back
// into focus). At most once a second.
let lastCheck = 0
export function checkOpenDocs({ now = Date.now() } = {}) {
  if (now - lastCheck < 1000) return Promise.resolve()
  lastCheck = now
  const ids = prefs.tabs.filter((id) => getDoc(id)?.linked)
  return Promise.all(ids.map((id) => checkDoc(id).catch(() => 'skipped')))
}

// --- Changes reported in open folders ----------------------------------------------

async function onMoved(doc, rootId, path) {
  try {
    const handle = await resolveFile(rootId, path)
    const name = path.split('/').pop()
    const rootName = prefs.workspaces.find((w) => w.id === rootId)?.name ?? ''
    setDocOptions(doc.id, { source: { root: rootId, path } })
    if (name !== doc.name) setDocOptions(doc.id, { name, autoName: false })
    moveToFolder(doc.id, docFolder(rootName, path))
    await relinkFile(doc.id, handle)
    delete diskNotices[doc.id]
    // Same file, new place: bring the document in step with it (its date
    // may differ; it may have been changed on the way).
    later(doc.id, 0)
  } catch {
    diskNotices[doc.id] = { kind: 'deleted' }
  }
}

export function handleFileEvent({ rootId, type, path, from }) {
  if (type === 'moved' && from) {
    const doc = findWorkspaceDoc(rootId, from)
    if (doc) return void onMoved(doc, rootId, path)
  }
  const doc = findWorkspaceDoc(rootId, path)
  if (!doc) return
  if (type === 'disappeared') {
    if (!isWriting(doc.id)) diskNotices[doc.id] = { kind: 'deleted' }
    return
  }
  // modified, appeared again (deleted then recreated), or moved here.
  later(doc.id)
}

let stop = null
// Start listening (once, from the app; tests call it too).
export function startLiveReload() {
  stop ??= onFileEvent(handleFileEvent)
  return () => {
    stop?.()
    stop = null
  }
}

