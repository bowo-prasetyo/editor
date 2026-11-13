// One-time changes to documents kept by earlier versions of Plumb. Runs at
// startup, once the documents are loaded (see main.js). Never deletes text by
// itself. See docs/files-and-drafts.md, "Migration".
import { prefs } from './prefs.js'
import { setDocOptions, state } from './store.js'

// Version 2: every document is a draft or a file (`kind`).
// Version 3: files opened on their own are files too (Recent files).
export const SCHEMA = 3
const MAX_RECENT_FILES = 20 // as in recent.js

// What a document from before version 2 becomes, given the ids of the folders
// open now. Returns the fields to change.
//   - From a folder that's still open: a file (stored without its text from
//     now on, if it has no unsaved changes: the text is on disk).
//   - From a folder that was closed, with unsaved changes: a draft that
//     remembers where it came from (`origin`).
//   - From a folder that was closed, nothing unsaved: a draft marked as a copy
//     of a file (`copyOf`), offered to the Trash once (see HomeView.vue).
//   - Anything else, and anything in the Trash: a draft (a file opened on
//     its own, too: see singleFiles() for version 3).
export function classify(doc, openRoots) {
  if (doc.kind) return null
  const src = doc.source
  if (!src || doc.deletedAt) return src ? { kind: 'draft', source: undefined } : { kind: 'draft' }
  if (openRoots.has(src.root)) return { kind: 'file' }
  const folder = doc.folder?.split('/')[0] ?? ''
  if (doc.diskDirty) return { kind: 'draft', source: undefined, origin: { folder, path: src.path } }
  return { kind: 'draft', source: undefined, copyOf: { folder, path: src.path } }
}

// Version 3: drafts that are files opened on their own (linked to a file,
// from no folder) become files, in Recent files: the 20 most recently
// edited, and any with unsaved changes. Older ones with nothing unsaved stay
// drafts, marked as copies of files (`copyOf`), offered to the Trash once.
// Returns [id, fields to change] pairs.
export function singleFiles(docs) {
  const candidates = docs
    .filter((d) => d.kind === 'draft' && d.linked && !d.source && !d.origin && !d.copyOf && !d.deletedAt)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  return candidates.map((d, i) =>
    i < MAX_RECENT_FILES || d.diskDirty
      ? [d.id, { kind: 'file', folder: undefined, pinned: undefined, openedAt: d.updatedAt ?? 0 }]
      : [d.id, { copyOf: { folder: '', path: d.name } }],
  )
}

export function migrate() {
  const from = prefs.schema ?? 1
  if (from >= SCHEMA) return 0
  let changed = 0
  if (from < 2) {
    const open = new Set(prefs.workspaces.map((w) => w.id))
    for (const doc of [...state.docs]) {
      const patch = classify(doc, open)
      if (!patch) continue
      setDocOptions(doc.id, patch)
      changed++
    }
  }
  for (const [id, patch] of singleFiles(state.docs)) {
    setDocOptions(id, patch)
    changed++
  }
  prefs.schema = SCHEMA
  return changed
}
