// Find helpers, kept free of DOM access so they are easy to test.

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Letters, digits and underscore in any script count as word characters.
const WORD = '[\\p{L}\\p{N}_]'

export function searchRegExp(query, { matchCase = false, wholeWord = false } = {}) {
  if (!query) return null
  let src = escapeRegExp(query)
  if (wholeWord) src = `(?<!${WORD})${src}(?!${WORD})`
  return new RegExp(src, 'gu' + (matchCase ? '' : 'i'))
}

// All matches as [start, end] pairs, in order.
export function findMatches(text, query, options) {
  const re = searchRegExp(query, options)
  if (!re) return []
  const out = []
  for (const m of text.matchAll(re)) out.push([m.index, m.index + m[0].length])
  return out
}

// Index of the first match at or after `pos` (wrapping to the start), or -1.
export function nextMatchIndex(matches, pos) {
  if (!matches.length) return -1
  const i = matches.findIndex(([s]) => s >= pos)
  return i === -1 ? 0 : i
}

// Index of the last match that starts before `pos` (wrapping to the end), or -1.
export function prevMatchIndex(matches, pos) {
  if (!matches.length) return -1
  for (let i = matches.length - 1; i >= 0; i--) if (matches[i][0] < pos) return i
  return matches.length - 1
}

// The edit that replaces every match: one contiguous range, so it can be
// applied (and undone) as a single step. Returns null when nothing matches.
export function replaceAllEdit(text, matches, replacement) {
  if (!matches.length) return null
  const from = matches[0][0]
  const to = matches.at(-1)[1]
  let insert = ''
  let pos = from
  for (const [s, e] of matches) {
    insert += text.slice(pos, s) + replacement
    pos = e
  }
  return { from, to, insert, count: matches.length }
}
