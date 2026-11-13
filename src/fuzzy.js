// Fuzzy matching for the quick switcher: the query's characters must appear
// in order (ignoring case), and matches at word starts, in a row, or in the
// file name (rather than its folder) rank higher.

const isBoundary = (text, i) => i === 0 || /[\s/._\-]/.test(text[i - 1]) || (/[a-z]/.test(text[i - 1]) && /[A-Z]/.test(text[i]))

// { score, positions } or null when the query doesn't match. `nameStart` is
// where the file name begins in `text` (after its folder path).
export function fuzzyMatch(query, text, nameStart = 0) {
  const q = query.toLowerCase().replace(/\s+/g, '')
  if (!q) return { score: 0, positions: [] }
  const lower = text.toLowerCase()
  // Prefer an exact substring: best score, simplest highlight.
  const at = lower.lastIndexOf(q)
  if (at !== -1) {
    const positions = Array.from({ length: q.length }, (_, k) => at + k)
    let score = 100 + q.length * 10 + (isBoundary(text, at) ? 30 : 0) + (at >= nameStart ? 50 : 0)
    if (at === nameStart) score += 40
    return { score: score - text.length * 0.1, positions }
  }
  const positions = []
  let score = 0
  let i = 0
  for (const ch of q) {
    // Prefer the next occurrence at a word start, else the next one at all.
    let j = lower.indexOf(ch, i)
    if (j === -1) return null
    for (let k = j; k !== -1; k = lower.indexOf(ch, k + 1)) {
      if (isBoundary(text, k)) {
        // Only jump ahead to a word start if the rest can still match after it.
        if (subsequence(q.slice(positions.length + 1), lower, k + 1)) j = k
        break
      }
    }
    score += 1
    if (isBoundary(text, j)) score += 8
    if (positions.length && j === positions.at(-1) + 1) score += 5
    if (j >= nameStart) score += 2
    positions.push(j)
    i = j + 1
  }
  return { score: score - text.length * 0.1, positions }
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
