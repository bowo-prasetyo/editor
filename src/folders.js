// Labels and sorting for the list of drafts.
//
// A draft's `folder` (e.g. "Work/Clients") is shown as a read-only label:
// drafts made before Plumb kept files and drafts apart could be filed in
// virtual folders. Labels can be filtered by and removed, but no new ones
// are made (see docs/files-and-drafts.md, "Drafts"). For a file from an open
// folder, `folder` is its place in that folder ("my-app/src").
import { compareNatural } from './locale.js'
import { t } from './i18n.js'

// "  /Work//Clients/ " -> "Work/Clients"; "" for none.
export function normalizeFolder(path = '') {
  return String(path)
    .split('/')
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('/')
}

// The labels in use, with how many drafts have each: [{ label, count }],
// in natural order.
export function labelsOf(docs) {
  const counts = new Map()
  for (const d of docs) if (d.folder) counts.set(d.folder, (counts.get(d.folder) ?? 0) + 1)
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => compareNatural(a.label, b.label))
}

// --- Sorting --------------------------------------------------------------

export const SORTS = {
  updated: { get label() { return t('home.sorts.updated') }, compare: (a, b) => b.updatedAt - a.updatedAt },
  name: {
    get label() {
      return t('home.sorts.name')
    },
    compare: (a, b) => compareNatural(a.name, b.name),
  },
  created: {
    get label() {
      return t('home.sorts.created')
    },
    compare: (a, b) => (b.createdAt ?? b.updatedAt) - (a.createdAt ?? a.updatedAt),
  },
  size: { get label() { return t('home.sorts.size') }, compare: (a, b) => b.content.length - a.content.length },
}

// Pinned drafts first, then by the chosen order. Ties fall back to most
// recently edited, so the order is stable.
export function sortDocs(docs, key = 'updated') {
  const cmp = (SORTS[key] ?? SORTS.updated).compare
  return [...docs].sort((a, b) => !!b.pinned - !!a.pinned || cmp(a, b) || b.updatedAt - a.updatedAt)
}
