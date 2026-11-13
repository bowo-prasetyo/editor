// The text of files in open folders, kept in memory between searches, so
// searching again doesn't read and decode every file again.
//
// An entry is used as it is while its folder is watched for changes (see
// watchRoot() in workspace.js): changes drop it. Otherwise, or for entries
// from before the watching started, the file's size and modification time
// are checked first (cheap: the file isn't read). The cache holds at most
// MAX_CACHE_CHARS characters; the least recently used files go first.
import { decodeBytes } from './textcodec.js'

export const MAX_CACHE_CHARS = 50_000_000 // about 100 MB
let limit = MAX_CACHE_CHARS
// For tests: a smaller cache.
export const setCacheLimit = (n = MAX_CACHE_CHARS) => (limit = n)
// Bigger files aren't searched (open them to search them).
export const MAX_FILE_BYTES = 2_000_000

// File types that are never text: skipped without reading them.
const BINARY = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'icns', 'tif', 'tiff', 'psd', 'heic',
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'mp4', 'mov', 'avi', 'mkv', 'webm',
  'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'zst', 'jar', 'war', 'whl', 'apk', 'dmg', 'iso',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'exe', 'dll', 'so', 'dylib', 'a', 'o', 'obj', 'lib', 'class', 'pyc', 'pyo', 'wasm', 'node',
  'sqlite', 'db', 'bin', 'dat',
])
export const isBinaryName = (name) => {
  const dot = name.lastIndexOf('.')
  return dot > 0 && BINARY.has(name.slice(dot + 1).toLowerCase())
}

// key ("rootId:path") -> { text | null, why?: 'binary' | 'big', size, lastModified, at }
// Map order is use order: the first entry is the least recently used.
const cache = new Map()
let chars = 0
// key -> when a change to it was last reported. An entry read before that
// isn't trusted (the change may have landed while it was being read).
const changed = new Map()

function put(key, entry) {
  drop(key)
  cache.set(key, entry)
  chars += entry.text?.length ?? 0
  for (const [k, e] of cache) {
    if (chars <= limit) break
    cache.delete(k)
    chars -= e.text?.length ?? 0
  }
}

function touch(key, entry) {
  cache.delete(key)
  cache.set(key, entry)
  return entry
}

// A change to the file was reported (see watchRoot() in workspace.js).
export function markChanged(key, now = Date.now()) {
  changed.set(key, now)
  drop(key)
  if (changed.size > 50_000) changed.clear() // only matters for a moment after a change
}

export function drop(key) {
  const e = cache.get(key)
  if (!e) return
  chars -= e.text?.length ?? 0
  cache.delete(key)
}

// Drop every entry whose key starts with `prefix` ("rootId:" for a whole
// folder, "rootId:src/" for a folder in it).
export function dropPrefix(prefix) {
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) drop(key)
}

export const cacheSize = () => ({ files: cache.size, chars })
export const isCached = (key) => cache.has(key)

const result = (e) => (e.text == null ? { skip: e.why } : { text: e.text })

// The text of a file: { text } or { skip: 'binary' | 'big' | 'gone' }.
// `trustSince`: when its folder started being watched (null if it isn't);
// an entry cached since then is used without looking at the file.
export async function readText(key, handle, { trustSince = null, now = Date.now } = {}) {
  if (isBinaryName(handle.name)) return { skip: 'binary' }
  const hit = cache.get(key)
  if (hit && trustSince != null && hit.at >= trustSince && !(changed.get(key) >= hit.at)) return result(touch(key, hit))
  // The time from before reading: a change reported after this makes the entry untrusted.
  const at = now()
  let file
  try {
    file = await handle.getFile()
  } catch {
    drop(key)
    return { skip: 'gone' }
  }
  const stamp = { size: file.size, lastModified: file.lastModified, at }
  if (hit && hit.size === file.size && hit.lastModified === file.lastModified) {
    return result(touch(key, { ...hit, at: stamp.at }))
  }
  if (file.size > MAX_FILE_BYTES) {
    put(key, { text: null, why: 'big', ...stamp })
    return { skip: 'big' }
  }
  let decoded
  try {
    decoded = decodeBytes(new Uint8Array(await file.arrayBuffer()))
  } catch {
    drop(key)
    return { skip: 'gone' }
  }
  put(key, decoded.binary ? { text: null, why: 'binary', ...stamp } : { text: decoded.text, ...stamp })
  return result(cache.get(key))
}
