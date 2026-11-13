// One-time changes to documents kept by earlier versions of Plumb. Runs at
// startup, once the documents are loaded (see main.js). Never deletes text by
// itself. See docs/files-and-drafts.md, "Migration".
import { prefs } from './prefs.js'
import { setDocOptions, state } from './store.js'

// Version 2: every document is a draft or a file (`kind`).
export const SCHEMA = 2

// What a document from before version 2 becomes, given the ids of the folders
// open now. Returns the fields to change.
//   - From a folder that's still open: a file (stored without its text from
//     now on, if it has no unsaved changes: the text is on disk).
//   - From a folder that was closed, with unsaved changes: a draft that
//     remembers where it came from (`origin`).
//   - From a folder that was closed, nothing unsaved: a draft marked as a copy
//     of a file (`copyOf`), offered to the Trash once (see HomeView.vue).
//   - Anything else, and anything in the Trash: a draft.
export function classify(doc, openRoots) {
  if (doc.kind) return null
  const src = doc.source
  if (!src || doc.deletedAt) return src ? { kind: 'draft', source: undefined } : { kind: 'draft' }
  if (openRoots.has(src.root)) return { kind: 'file' }
  const folder = doc.folder?.split('/')[0] ?? ''
  if (doc.diskDirty) return { kind: 'draft', source: undefined, origin: { folder, path: src.path } }
  return { kind: 'draft', source: undefined, copyOf: { folder, path: src.path } }
}

export function migrate() {
  if ((prefs.schema ?? 1) >= SCHEMA) return 0
  const open = new Set(prefs.workspaces.map((w) => w.id))
  let changed = 0
  for (const doc of [...state.docs]) {
    const patch = classify(doc, open)
    if (!patch) continue
    setDocOptions(doc.id, patch)
    changed++
  }
  prefs.schema = SCHEMA
  return changed
}
