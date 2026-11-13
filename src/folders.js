// Folders and sorting for the document list. A document's folder is a path
// such as "Work/Clients" (or none); folders exist as long as a document is in
// them, or the user created them and they're remembered in preferences.

// "  /Work//Clients/ " -> "Work/Clients"; "" for none.
export function normalizeFolder(path = '') {
  return String(path)
    .split('/')
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('/')
}

// Is the document in this folder, or in a folder inside it?
// folder: '' or undefined = everything; NONE = documents in no folder.
export const NONE = '\u0000none'
export function inFolder(doc, folder) {
  if (!folder) return true
  const f = doc.folder ?? ''
  if (folder === NONE) return !f
  return f === folder || f.startsWith(folder + '/')
}

// The folder tree: [{ path, name, depth, count }] in display order, where
// count includes documents in subfolders. Parents of nested folders are
// listed even if they hold no documents directly.
export function folderTree(docs, extra = []) {
  const counts = new Map()
  const add = (path, n) => {
    const parts = path.split('/')
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('/')
      counts.set(p, (counts.get(p) ?? 0) + n)
    }
  }
  for (const d of docs) if (d.folder) add(d.folder, 1)
  for (const f of extra) {
    const p = normalizeFolder(f)
    if (p) add(p, 0)
  }
  // Sort so that each folder comes right before its subfolders.
  const paths = [...counts.keys()].sort((a, b) => {
    const pa = a.split('/')
    const pb = b.split('/')
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
      const c = pa[i].localeCompare(pb[i], undefined, { sensitivity: 'base', numeric: true })
      if (c) return c
    }
    return pa.length - pb.length
  })
  return paths.map((path) => {
    const parts = path.split('/')
    return { path, name: parts.at(-1), depth: parts.length - 1, count: counts.get(path) }
  })
}

// The new folder of a document when folder `from` is renamed to `to` (or
// removed, with to = parent or ''). Undefined if the document isn't affected.
export function renamedFolder(docFolder = '', from, to) {
  if (docFolder === from) return to
  if (docFolder.startsWith(from + '/')) return normalizeFolder(to + docFolder.slice(from.length))
  return undefined
}

export const parentFolder = (path) => path.split('/').slice(0, -1).join('/')

// --- Sorting --------------------------------------------------------------

export const SORTS = {
  updated: { label: 'Last edited', compare: (a, b) => b.updatedAt - a.updatedAt },
  name: {
    label: 'Name',
    compare: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }),
  },
  created: {
    label: 'Date created',
    compare: (a, b) => (b.createdAt ?? b.updatedAt) - (a.createdAt ?? a.updatedAt),
  },
  size: { label: 'Size', compare: (a, b) => b.content.length - a.content.length },
}

export function sortDocs(docs, key = 'updated') {
  const cmp = (SORTS[key] ?? SORTS.updated).compare
  // Ties fall back to most recently edited, so the order is stable.
  return [...docs].sort((a, b) => cmp(a, b) || b.updatedAt - a.updatedAt)
}
