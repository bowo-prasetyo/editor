// Find helpers, kept free of DOM access so they are easy to test.
//
// A match is [start, end], plus, for regular expressions, a third element
// with what the expression captured (used by replacement patterns):
//   [start, end, { groups: [...], named: {...} | undefined }]

export const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Letters, digits and underscore in any script count as word characters.
const WORD = '[\\p{L}\\p{N}_]'

// Find lists at most this many matches (Replace all still replaces every one),
// so a pattern like "." in a big file stays quick.
export const MAX_MATCHES = 100_000

// The RegExp for a search, or null for an empty query. Throws a SyntaxError
// for an invalid regular expression.
//   regex:     the query is a JavaScript regular expression; ^ and $ match at
//              line starts and ends, and a match can span lines (with \n).
//   matchCase: off means case-insensitive.
//   wholeWord: the match can't start or end inside a word.
export function searchRegExp(query, { matchCase = false, wholeWord = false, regex = false } = {}) {
  if (!query) return null
  let src = regex ? query : escapeRegExp(query)
  if (wholeWord) src = `(?<!${WORD})(?:${src})(?!${WORD})`
  return new RegExp(src, 'gu' + (regex ? 'm' : '') + (matchCase ? '' : 'i'))
}

// Why a query can't be searched for, or '' if it can.
export function queryError(query, options) {
  try {
    searchRegExp(query, options)
    return ''
  } catch (e) {
    return e instanceof SyntaxError ? 'Invalid pattern' : e.message
  }
}

// All matches, in order (none for an invalid pattern). Empty matches (such
// as "^" or "\b") are included: replacing them inserts text.
export function findMatches(text, query, options = {}, limit = Infinity) {
  let re
  try {
    re = searchRegExp(query, options)
  } catch {
    return []
  }
  if (!re) return []
  const out = []
  for (const m of text.matchAll(re)) {
    const end = m.index + m[0].length
    out.push(options.regex ? [m.index, end, { groups: m.slice(1), named: m.groups }] : [m.index, end])
    if (out.length >= limit) break
  }
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

// The text that replaces one match. Without `regex` the replacement is used
// as typed. With it, these are expanded, as in JavaScript's String.replace:
//   $&  the whole match     $1…$99  a numbered group    $<name>  a named group
//   $`  text before it      $'      text after it       $$       a "$"
// and \n, \t, \r and \\ stand for a new line, tab, carriage return, backslash.
export function expandReplacement(replacement, match, text, regex = false) {
  if (!regex) return replacement
  const [start, end, { groups = [], named } = {}] = match
  return replacement.replace(/\$(\$|&|`|'|\d{1,2}|<([^>]*)>)|\\([ntr\\])/g, (all, token, name, esc) => {
    if (esc) return { n: '\n', t: '\t', r: '\r', '\\': '\\' }[esc]
    if (token === '$') return '$'
    if (token === '&') return text.slice(start, end)
    if (token === '`') return text.slice(0, start)
    if (token === "'") return text.slice(end)
    if (name !== undefined) return named ? (named[name] ?? '') : all
    // $10 means group 10 if there is one, else group 1 followed by "0".
    const n = +token
    if (token.length === 2 && n > groups.length) {
      const one = +token[0]
      return one >= 1 && one <= groups.length ? (groups[one - 1] ?? '') + token[1] : all
    }
    return n >= 1 && n <= groups.length ? (groups[n - 1] ?? '') : all
  })
}

// The edit that replaces every match: one contiguous range, so it can be
// applied (and undone) as a single step. Returns null when nothing matches.
export function replaceAllEdit(text, matches, replacement, regex = false) {
  if (!matches.length) return null
  const from = matches[0][0]
  const to = matches.at(-1)[1]
  let insert = ''
  let pos = from
  for (const m of matches) {
    insert += text.slice(pos, m[0]) + expandReplacement(replacement, m, text, regex)
    pos = m[1]
  }
  return { from, to, insert, count: matches.length }
}
