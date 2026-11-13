// Search (and replace) across every document and the files in open folders.
//
// Documents are searched as they are in the browser. Files in open folders
// that have no document yet are read from disk (text files up to
// MAX_FILE_BYTES). Replacing never writes to disk: each changed file
// becomes a document with changes not yet saved to its file, and a version
// from before the replace is kept. "Save all" then writes them.
import { reactive } from 'vue'
import { findMatches, replaceAllEdit, searchRegExp } from './find.js'
import { MAX_FILE_BYTES, cacheSize, isCached, MAX_CACHE_CHARS, readText } from './filecache.js'
import { displayName } from './naming.js'
import { prefs } from './prefs.js'
import { getDoc, recordVersion, state, updateDoc } from './store.js'
import { ensureAllIndexes, fileIndex, findWorkspaceDoc, openWorkspaceFile, trustSince } from './workspace.js'

// Results stop after this many matches (a file's matches are all counted).
export const MAX_RESULTS = 10_000
export { MAX_FILE_BYTES }
const PREVIEW = 120 // characters of context around a match

// --- Which files: "*.js, src/, !test/" ----------------------------------------------

// A glob as a RegExp source: * is any characters but "/", ** any at all,
// ? one character.
function globSource(glob) {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        out += '.*'
        i++
        if (glob[i + 1] === '/') i++ // "**/" also matches no folder at all
      } else out += '[^/]*'
    } else if (c === '?') out += '[^/]'
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return out
}

// A test for paths ("folder/sub/name.ext") from a comma-separated list of
// patterns. A pattern without "/" matches file names ("*.md", "README*");
// one with "/" matches part of the path ("src/", "docs/**/*.md"). Patterns
// starting with "!" exclude. With no include patterns, everything is in.
export function pathFilter(spec = '') {
  const parts = spec.split(',').map((s) => s.trim()).filter(Boolean)
  const include = []
  const exclude = []
  for (let p of parts) {
    const list = p.startsWith('!') ? exclude : include
    p = p.replace(/^!/, '').trim()
    if (!p) continue
    const re = p.includes('/')
      ? new RegExp(`(^|/)${globSource(p.replace(/^\//, ''))}`, 'i')
      : new RegExp(`(^|/)${globSource(p)}$`, 'i')
    list.push(re)
  }
  return (path) => (!include.length || include.some((re) => re.test(path))) && !exclude.some((re) => re.test(path))
}

// --- Matches in one text ------------------------------------------------------------------

// Matches with their line, column and a preview of the line:
// [{ from, to, line, col, before, text, after }]. `limit` caps how many.
export function searchText(text, query, options = {}, limit = Infinity) {
  const matches = findMatches(text, query, options, limit)
  const out = []
  let line = 1
  let lineStart = 0
  let scanned = 0
  for (const [from, to] of matches) {
    // Count line breaks up to this match (matches are in order).
    for (let i = text.indexOf('\n', scanned); i !== -1 && i < from; i = text.indexOf('\n', i + 1)) {
      line++
      lineStart = i + 1
    }
    scanned = from
    let lineEnd = text.indexOf('\n', from)
    if (lineEnd === -1) lineEnd = text.length
    const shownEnd = Math.min(to, lineEnd) // a match across lines shows its first line
    const start = Math.max(lineStart, from - PREVIEW / 2)
    const before = text.slice(start, from).replace(/^\s+/, '')
    out.push({
      from,
      to,
      line,
      col: from - lineStart + 1,
      before: (start > lineStart ? '…' : '') + before,
      text: text.slice(from, shownEnd),
      after: text.slice(shownEnd, Math.min(lineEnd, shownEnd + PREVIEW)) + (lineEnd > shownEnd + PREVIEW ? '…' : ''),
    })
  }
  return out
}

// --- Searching everything ----------------------------------------------------------------

// Where to look: 'all', 'documents' (in the browser) or 'folders' (files
// in open folders, including those opened as documents).
export const SCOPES = { all: 'Everything', documents: 'Drafts', folders: 'Open folders' }

const docPath = (doc) => (doc.folder ? `${doc.folder}/` : '') + displayName(doc.name)

// What could be searched: documents, and folder files with no document.
// Each target: { key, kind: 'doc' | 'file', name, folder, path, doc?, rootId?, filePath?, handle? }
export async function searchTargets(scope = 'all') {
  const targets = []
  for (const doc of state.docs) {
    if (doc.deletedAt) continue
    const file = doc.kind === 'file'
    if (scope === 'folders' && !file) continue
    if (scope === 'documents' && file) continue
    // A file with nothing unsaved is searched from disk, as a folder file below.
    if (file && !doc.diskDirty) continue
    targets.push({ key: doc.id, kind: 'doc', name: displayName(doc.name), folder: doc.folder ?? '', path: docPath(doc), doc })
  }
  if (scope === 'documents') return targets
  await ensureAllIndexes()
  for (const w of prefs.workspaces) {
    const index = fileIndex.get(w.id)
    if (!index?.ready) continue
    for (const { path, handle } of index.files) {
      if (findWorkspaceDoc(w.id, path)?.diskDirty) continue // searched as its edited text
      const slash = path.lastIndexOf('/')
      const folder = [w.name, ...(slash === -1 ? [] : [path.slice(0, slash)])].join('/')
      targets.push({
        key: `${w.id}:${path}`,
        kind: 'file',
        name: path.slice(slash + 1),
        folder,
        path: `${w.name}/${path}`,
        rootId: w.id,
        filePath: path,
        handle,
      })
    }
  }
  return targets
}

// The text of a target, or null if it can't be searched (binary, too big,
// gone). Folder files come from the cache when they can (see filecache.js).
export async function targetText(target) {
  if (target.kind === 'doc') return getDoc(target.doc.id)?.content ?? null
  const r = await readText(target.key, target.handle, { trustSince: trustSince(target.rootId) })
  return r.text ?? null
}

// Let the page draw and take input: at most every FRAME ms of work.
const FRAME = 12
const yieldToPage = () =>
  globalThis.scheduler?.yield
    ? globalThis.scheduler.yield()
    : new Promise((resolve) => {
        const ch = new MessageChannel()
        ch.port1.onmessage = () => {
          ch.port1.close() // an open port keeps Node (tests) running
          resolve()
        }
        ch.port2.postMessage(null)
      })

// Search everything in `scope`, calling onResult({ target, matches }) for
// each file with matches as it's found, and onProgress(done, total).
// Resolves to { files, matches, skipped, truncated, aborted }.
// Documents and files whose text is in the cache are searched straight
// away; the rest are read up to READ_AT_ONCE at a time.
export async function searchAll(query, options = {}, { scope = 'all', files = '', signal, onResult, onProgress } = {}) {
  const summary = { files: 0, matches: 0, skipped: 0, truncated: false, aborted: false }
  if (!searchRegExp(query, options)) return summary // throws for an invalid pattern
  const keep = pathFilter(files)
  const targets = (await searchTargets(scope)).filter((t) => keep(t.path))
  const READ_AT_ONCE = 32
  let done = 0
  let last = performance.now()

  const check = (target, text) => {
    done++
    if (text == null) return void (target.kind === 'file' && summary.skipped++)
    if (summary.truncated) return
    const matches = searchText(text, query, options, MAX_RESULTS - summary.matches)
    if (!matches.length) return
    summary.files++
    summary.matches += matches.length
    if (summary.matches >= MAX_RESULTS) summary.truncated = true
    onResult?.({ target, matches })
  }
  const breathe = async () => {
    if (performance.now() - last < FRAME) return
    onProgress?.(done, targets.length)
    await yieldToPage()
    last = performance.now()
  }

  for (let i = 0; i < targets.length; ) {
    if (signal?.aborted) return { ...summary, aborted: true }
    // Read a batch of files at once; documents and cached files are instant.
    const batch = targets.slice(i, i + READ_AT_ONCE)
    i += batch.length
    const texts = await Promise.all(batch.map(targetText))
    if (signal?.aborted) return { ...summary, aborted: true }
    batch.forEach((t, k) => check(t, texts[k]))
    await breathe()
  }
  onProgress?.(done, targets.length)
  return summary
}

// Read files in open folders into the cache in the background (when the
// search page opens), so the first search is quick too. Stops when the
// cache is nearly full, or when `signal` aborts.
export async function warmCache({ signal, concurrency = 8 } = {}) {
  await ensureAllIndexes()
  const todo = []
  for (const w of prefs.workspaces) {
    for (const { path, handle } of fileIndex.get(w.id)?.files ?? []) {
      const key = `${w.id}:${path}`
      if (!isCached(key) && !findWorkspaceDoc(w.id, path)) todo.push({ key, handle, rootId: w.id })
    }
  }
  let next = 0
  const worker = async () => {
    while (next < todo.length && !signal?.aborted && cacheSize().chars < MAX_CACHE_CHARS * 0.9) {
      const { key, handle, rootId } = todo[next++]
      await readText(key, handle, { trustSince: trustSince(rootId) })
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return { read: Math.min(next, todo.length), of: todo.length }
}

// --- Replacing ----------------------------------------------------------------------------

// Replace every match in one target (opening a folder file as a document
// first). Matches are found again in the current text, so edits made since
// the search are respected. Returns { doc, count }.
export async function replaceInTarget(target, query, options, replacement) {
  let doc = target.kind === 'doc' ? getDoc(target.doc.id) : findWorkspaceDoc(target.rootId, target.filePath)
  // (Opening it reads the text of a file not read yet.)
  if (!doc || doc.unread) doc = (await openWorkspaceFile(target.rootId, target.filePath, target.handle)).doc
  const text = doc.content
  const edit = replaceAllEdit(text, findMatches(text, query, options), replacement, options.regex)
  if (!edit) return { doc, count: 0 }
  await recordVersion(doc.id, 'manual', 'Before replacing in files')
  updateDoc(doc.id, { content: text.slice(0, edit.from) + edit.insert + text.slice(edit.to) })
  return { doc: getDoc(doc.id), count: edit.count }
}

// Replace in every target. Returns { files, count, docs }.
export async function replaceAll(targets, query, options, replacement) {
  const out = { files: 0, count: 0, docs: [] }
  for (const t of targets) {
    const r = await replaceInTarget(t, query, options, replacement)
    if (!r.count) continue
    out.files++
    out.count += r.count
    out.docs.push(r.doc)
  }
  return out
}

// --- The search page's state, kept while moving around the app -------------------------

export const search = reactive({
  query: '',
  replace: '',
  showReplace: false,
  files: '',
  scope: 'all',
  matchCase: false,
  wholeWord: false,
  regex: false,
})
