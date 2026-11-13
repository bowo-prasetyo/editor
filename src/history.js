// Version history: copies of a document kept over time, so earlier text can
// be looked at and brought back. Stored by the backend (see backends.js);
// this module decides when to keep a version and which old ones to let go.

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// While editing, a version is kept at most this often.
export const AUTO_INTERVAL = 5 * MINUTE

// Kinds of version and how they're described.
export const KINDS = {
  auto: 'Autosaved',
  opened: 'Opened from file',
  saved: 'Saved to file',
  manual: 'Saved version',
  restore: 'Before restoring an older version',
}

// Versions the user made or that mark an event are kept longer than
// automatic ones.
const MARKED = new Set(['manual', 'saved', 'opened', 'restore'])
export const MAX_MARKED = 50
export const MAX_VERSIONS = 100
// Text kept per document, in characters: big documents keep fewer versions.
export const MAX_CHARS = 20_000_000

// A quick fingerprint of the text (FNV-1a), to skip storing identical copies.
export function hashText(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${(h >>> 0).toString(16)}:${text.length}`
}

// Which versions to delete, given their metadata (any order) and the time.
//   Automatic versions: all from the last hour, then the newest in each hour
//   for a day, the newest in each day for 30 days, none older.
//   Marked versions (saved by hand, saved to file, opened, before a restore):
//   the newest MAX_MARKED.
//   Then, oldest first, until at most MAX_VERSIONS remain and their text
//   adds up to at most MAX_CHARS. The newest version is always kept.
export function versionsToDrop(metas, now, { maxVersions = MAX_VERSIONS, maxChars = MAX_CHARS } = {}) {
  const sorted = [...metas].sort((a, b) => b.at - a.at) // newest first
  const drop = new Set()
  const seenBucket = new Set()
  let marked = 0
  for (const v of sorted) {
    const age = now - v.at
    if (MARKED.has(v.kind)) {
      if (++marked > MAX_MARKED) drop.add(v.id)
      continue
    }
    if (age < HOUR) continue
    if (age >= 30 * DAY) {
      drop.add(v.id)
      continue
    }
    const bucket = age < DAY ? `h${Math.floor(v.at / HOUR)}` : `d${Math.floor(v.at / DAY)}`
    if (seenBucket.has(bucket)) drop.add(v.id)
    else seenBucket.add(bucket)
  }
  // Size and count limits: drop the oldest remaining (never the newest).
  const kept = sorted.filter((v) => !drop.has(v.id)) // newest first
  let count = kept.length
  let chars = kept.reduce((n, v) => n + (v.size ?? 0), 0)
  for (let i = kept.length - 1; i >= 1 && (count > maxVersions || chars > maxChars); i--) {
    drop.add(kept[i].id)
    count--
    chars -= kept[i].size ?? 0
  }
  return [...drop]
}

// Version history on top of a backend. `now` is replaceable for tests.
export function createHistory(backend, { now = () => Date.now() } = {}) {
  const latest = new Map() // docId -> newest version's metadata, or null

  async function newest(docId) {
    if (!latest.has(docId)) latest.set(docId, (await backend.listVersions(docId)).at(-1) ?? null)
    return latest.get(docId)
  }

  async function prune(docId) {
    const drop = versionsToDrop(await backend.listVersions(docId), now())
    if (drop.length) await backend.removeVersions(drop)
  }

  // Keep the document's current text as a version. Automatic versions are
  // skipped when the text hasn't changed since the newest version.
  async function record(doc, kind = 'auto', label = '') {
    const hash = hashText(doc.content)
    const prev = await newest(doc.id)
    // Automatic and before-restore copies are pointless if the newest
    // version already holds this text.
    if ((kind === 'auto' || kind === 'restore') && prev?.hash === hash) return null
    const meta = { docId: doc.id, at: now(), kind, size: doc.content.length, hash }
    if (label) meta.label = label
    const id = await backend.addVersion(meta, doc.content)
    latest.set(doc.id, { ...meta, id })
    await prune(doc.id)
    return id
  }

  // Called after each save while editing: keep a version if the last one is
  // AUTO_INTERVAL old (or, for a document without versions, if it was
  // created that long ago).
  async function maybeRecord(doc) {
    const prev = await newest(doc.id)
    const since = prev?.at ?? doc.createdAt ?? 0
    if (now() - since < AUTO_INTERVAL) return null
    return record(doc, 'auto')
  }

  return {
    record,
    maybeRecord,
    list: (docId) => backend.listVersions(docId),
    text: (id) => backend.getVersionText(id),
    // The document was deleted forever (the backend deleted its versions).
    forget: (docId) => latest.delete(docId),
  }
}
