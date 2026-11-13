// Fuzzy matching for the quick switcher: the query's characters must appear
// in order (ignoring case), and matches at word starts, in a row, or in the
// file name (rather than its folder) rank higher.
//
// Matching compares folded text: lowercased and in Unicode's composed form
// (NFC), so "é" typed as one character matches an "é" stored as "e" plus an
// accent, as macOS writes file names. Folding can change a text's length
// ("İ" lowercases to two characters), so positions are worked out in the
// folded text and then mapped back to the original's.

// Characters with the marks (accents) that follow them: folded together.
const CLUSTER = /\P{M}\p{M}*|\p{M}+/gsu
const NON_ASCII = /[^\p{ASCII}]/u

// { text, start, end }: the folded text, and for each of its characters the
// range of the original text it came from.
function fold(text) {
  if (!NON_ASCII.test(text)) {
    const lower = text.toLowerCase()
    return { text: lower, start: null, end: null }
  }
  let out = ''
  const start = []
  const end = []
  for (const m of text.matchAll(CLUSTER)) {
    const f = m[0].normalize('NFC').toLowerCase()
    for (let k = 0; k < f.length; k++) {
      start.push(m.index)
      end.push(m.index + m[0].length)
    }
    out += f
  }
  return { text: out, start, end }
}

// Positions in the folded text -> every position of the original they cover.
function originalPositions(folded, positions) {
  if (!folded.start) return positions
  const out = new Set()
  for (const p of positions) for (let i = folded.start[p]; i < folded.end[p]; i++) out.add(i)
  return [...out].sort((a, b) => a - b)
}

const isBoundary = (text, i) => i === 0 || /[\s/._-]/.test(text[i - 1]) || (/[a-z]/.test(text[i - 1]) && /[A-Z]/.test(text[i]))

// { score, positions } or null when the query doesn't match. `nameStart` is
// where the file name begins in `text` (after its folder path).
export function fuzzyMatch(query, text, nameStart = 0) {
  const q = query.replace(/\s+/g, '').normalize('NFC').toLowerCase()
  if (!q) return { score: 0, positions: [] }
  const folded = fold(text)
  const lower = folded.text
  const orig = (p) => (folded.start ? folded.start[p] : p) // where a folded character starts in `text`
  // Prefer an exact substring: best score, simplest highlight.
  const at = lower.lastIndexOf(q)
  if (at !== -1) {
    const positions = Array.from({ length: q.length }, (_, k) => at + k)
    const o = orig(at)
    let score = 100 + q.length * 10 + (isBoundary(text, o) ? 30 : 0) + (o >= nameStart ? 50 : 0)
    if (o === nameStart) score += 40
    return { score: score - text.length * 0.1, positions: originalPositions(folded, positions) }
  }
  const positions = []
  let score = 0
  let i = 0
  for (const ch of q) {
    // Prefer the next occurrence at a word start, else the next one at all.
    let j = lower.indexOf(ch, i)
    if (j === -1) return null
    for (let k = j; k !== -1; k = lower.indexOf(ch, k + 1)) {
      if (isBoundary(text, orig(k))) {
        // Only jump ahead to a word start if the rest can still match after it.
        if (subsequence(q.slice(positions.length + 1), lower, k + 1)) j = k
        break
      }
    }
    score += 1
    if (isBoundary(text, orig(j))) score += 8
    if (positions.length && j === positions.at(-1) + 1) score += 5
    if (orig(j) >= nameStart) score += 2
    positions.push(j)
    i = j + 1
  }
  return { score: score - text.length * 0.1, positions: originalPositions(folded, positions) }
}

function subsequence(q, lower, from) {
  let i = from
  for (const ch of q) {
    i = lower.indexOf(ch, i)
    if (i === -1) return false
    i++
  }
  return true
}

// Split text into [{ text, hit }] runs for highlighting matched characters.
export function highlightRuns(text, positions) {
  const hits = new Set(positions)
  const runs = []
  for (let i = 0; i < text.length; i++) {
    const hit = hits.has(i)
    if (runs.length && runs.at(-1).hit === hit) runs.at(-1).text += text[i]
    else runs.push({ text: text[i], hit })
  }
  return runs
}
