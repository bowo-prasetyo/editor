// Files that mix line endings (some lines end in CRLF, others in LF or CR).
//
// The editor works with "\n" only, so a file's line endings are put back when
// it's written. Most files use one ending throughout: `doc.eol` is enough.
// For a file that mixes them, `doc.lineEnds` remembers each line's ending as
// last read from or written to disk, with a fingerprint of each line's text:
//
//   { ends: 'CLC…', hashes: [n, n, n, …] }
//
// `ends` has one letter per line break (L = LF, C = CRLF, R = CR); `hashes`
// has one number per line. On save, the lines as they are now are matched
// against those fingerprints (a line diff), so:
//
//   - a line that wasn't touched keeps its own ending;
//   - a line that was edited keeps its ending too;
//   - only lines that were added get the file's most common ending (`doc.eol`).
//
// Where lines were both edited and added in one place, the first lines there
// count as the edited ones (typing usually goes on downwards).
//
// A wrong match (two different lines with the same 32-bit fingerprint) can
// only change which ending a line gets, never the text.

const CODE = { '\n': 'L', '\r\n': 'C', '\r': 'R' }
const EOL = { L: '\n', C: '\r\n', R: '\r' }

// FNV-1a over UTF-16 code units: fast, and good enough to tell lines apart.
export function hashLine(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// A record of `raw`'s line endings (text as decoded, endings not yet
// normalised), or null if they're all the same (or there are none).
export function recordLineEnds(raw) {
  const ends = []
  const hashes = []
  let start = 0
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i)
    if (c !== 13 && c !== 10) continue
    hashes.push(hashLine(raw.slice(start, i)))
    if (c === 13 && raw.charCodeAt(i + 1) === 10) {
      ends.push('C')
      i++
    } else ends.push(c === 13 ? 'R' : 'L')
    start = i + 1
  }
  hashes.push(hashLine(raw.slice(start)))
  return makeRecord(ends.join(''), hashes)
}

const makeRecord = (ends, hashes) => (/^(.)\1*$/.test(ends) || !ends ? null : { ends, hashes })

const isRecord = (r) => r && typeof r.ends === 'string' && Array.isArray(r.hashes) && r.hashes.length === r.ends.length + 1

// For each line now, the line it was before (both given as fingerprints), or
// -1 for an added line. Unchanged lines are found with a diff. In a changed
// block between them, lines pair up by position, as many as both sides have
// (edited lines); the rest are added (or were deleted).
export function matchLines(before, now) {
  const map = new Array(now.length).fill(-1)
  const pairs = commonLines(before, now)
  let i = 0
  let j = 0
  for (const [pi, pj] of [...pairs, [before.length, now.length]]) {
    // The changed block before this match: old [i, pi), new [j, pj).
    for (let k = 0; k < Math.min(pi - i, pj - j); k++) map[j + k] = i + k
    if (pj < now.length) map[pj] = pi
    i = pi + 1
    j = pj + 1
  }
  return map
}

// Longest run of lines in common, as [[oldIndex, newIndex], …] in order.
// Common starts and ends are trimmed first (most saves change a few lines in
// one place); the middle uses Myers' diff, up to MAX_EDITS differences.
const MAX_EDITS = 1000
function commonLines(a, b) {
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) endA--, endB--
  const pairs = []
  for (let k = 0; k < start; k++) pairs.push([k, k])
  for (const [x, y] of myers(a, b, start, endA, start, endB)) pairs.push([x, y])
  for (let k = 0; k < a.length - endA; k++) pairs.push([endA + k, endB + k])
  return pairs
}

// Myers' O(ND) diff of a[a0..a1) and b[b0..b1): the matching index pairs.
// Gives up (no matches) beyond MAX_EDITS differences: those lines then get
// the file's main ending, or pair by position if the block keeps its size.
function myers(a, b, a0, a1, b0, b1) {
  const n = a1 - a0
  const m = b1 - b0
  if (!n || !m) return []
  const max = Math.min(n + m, MAX_EDITS)
  const off = max + 1
  const v = new Int32Array(2 * max + 3)
  const trace = []
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[a0 + x] === b[b0 + y]) x++, y++
      v[off + k] = x
      if (x >= n && y >= m) return backtrack(trace, off, a0, b0, n, m, d)
    }
  }
  return []
}

function backtrack(trace, off, a0, b0, n, m, d) {
  const pairs = []
  let x = n
  let y = m
  for (let step = d; step > 0; step--) {
    const v = trace[step]
    const k = x - y
    const prevK = k === -step || (k !== step && v[off + k - 1] < v[off + k + 1]) ? k + 1 : k - 1
    const prevX = v[off + prevK]
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) pairs.push([a0 + --x, b0 + --y])
    x = prevX
    y = prevY
  }
  while (x > 0 && y > 0) pairs.push([a0 + --x, b0 + --y])
  return pairs.reverse()
}

// `text` ("\n"-separated) with each line break written in the ending it had
// in the file (see the top of this file), new ones as `eol`. Also returns the
// record of what was written: null if it ended up using one ending throughout.
export function applyLineEnds(text, record, eol = '\n') {
  const lines = text.split('\n')
  const hashes = lines.map(hashLine)
  const map = isRecord(record) ? matchLines(record.hashes, hashes) : null
  let out = ''
  let ends = ''
  for (let j = 0; j < lines.length; j++) {
    out += lines[j]
    if (j === lines.length - 1) break
    const i = map ? map[j] : -1
    const code = i >= 0 && i < record.ends.length ? record.ends[i] : CODE[eol]
    out += EOL[code]
    ends += code
  }
  return { text: out, lineEnds: makeRecord(ends, hashes) }
}
