// Open tabs, recently opened documents, and each open document's editor
// state (undo history, selection, scroll), so switching tabs loses nothing.
import { prefs } from './prefs.js'
import { getDoc, setDocOptions, state } from './store.js'
import { neighborTab, touched, withTab, withoutTab } from './tabs.js'

const snapshots = new Map() // doc id -> editor snapshot (memory only)

const isOpenable = (id) => {
  const d = getDoc(id)
  return !!d && !d.deletedAt
}

// Tabs whose documents still exist (not deleted or in the Trash).
export function liveTabs() {
  void state.docs.length // re-evaluate when documents come and go
  return prefs.tabs.filter(isOpenable)
}

// A document was opened: give it a tab (next to the one it was opened
// from) and put it first among recent documents.
export function opened(id, from = null) {
  const d = getDoc(id)
  if (d?.kind === 'file' && !d.source) setDocOptions(id, { openedAt: Date.now() }) // Recent files
  prefs.tabs = withTab(liveTabs(), id, from)
  prefs.recent = touched(prefs.recent.filter((r) => getDoc(r)), id)
}

// Close a tab. Returns the id to show instead if it was the active one
// (null for the document list).
export function closeTab(id) {
  const next = neighborTab(prefs.tabs, id)
  prefs.tabs = withoutTab(prefs.tabs, id)
  snapshots.delete(id)
  return next
}

export function saveSnapshot(id, snap) {
  snapshots.set(id, snap)
  // Only keep editor states for open tabs.
  for (const key of snapshots.keys()) if (key !== id && !prefs.tabs.includes(key)) snapshots.delete(key)
}

export const takeSnapshot = (id) => snapshots.get(id) ?? null
