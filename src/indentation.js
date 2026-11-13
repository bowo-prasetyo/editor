// Indentation: tabs or spaces, and how wide. Detected from a document's
// text, with defaults by file type, and convertible between the two.
//   { type: 'spaces' | 'tabs', size: 2 | 4 | 8 }
import { extension } from './filetype.js'
import { t } from './i18n.js'

export const SIZES = [2, 4, 8]

const FOUR = new Set(['py', 'pyw', 'rs', 'java', 'kt', 'kts', 'cs', 'php', 'swift', 'scala', 'dart', 'r', 'pl', 'lua', 'sql'])
const TABS = new Set(['go', 'mk', 'tsv'])
const TAB_NAMES = new Set(['makefile', 'gnumakefile'])

// What a new document of this type uses before it has any indented lines.
// `fallback` is for types without a convention of their own (a setting).
export function defaultIndent(name = '', fallback = { type: 'spaces', size: 2 }) {
  const base = name.trim().split(/[\\/]/).pop().toLowerCase()
  const ext = extension(name)
  if (TAB_NAMES.has(base) || TABS.has(ext)) return { type: 'tabs', size: 4 }
  if (FOUR.has(ext)) return { type: 'spaces', size: 4 }
  return { type: fallback.type, size: fallback.size }
}

// Guess the indentation from the text: tabs if most indented lines start
// with a tab; otherwise the most common step between one line's
// indentation and the next. Null if there's too little to tell. Looks at the
// first `maxLines` lines only, so it's quick on big files.
export function detectIndent(text, maxLines = 10_000) {
  let tabs = 0
  let spaces = 0
  const steps = new Map()
  let prev = 0
  let lines = 0
  for (let start = 0; start <= text.length && lines < maxLines; lines++) {
    let end = text.indexOf('\n', start)
    if (end === -1) end = text.length
    const ch = text[start]
    if (ch === '\t') tabs++
    else if (ch === ' ') {
      let n = 0
      while (text[start + n] === ' ') n++
      // Skip " * " lines inside block comments and lines of only spaces.
      const next = text[start + n]
      if (next !== '*' && next !== '\n' && next !== '\r' && start + n < end) {
        spaces++
        const step = Math.abs(n - prev)
        if (step >= 2 && step <= 8) steps.set(step, (steps.get(step) ?? 0) + 1)
        prev = n
      }
    } else if (start < end && ch !== '\r') prev = 0
    start = end + 1
  }
  if (tabs + spaces < 2) return null
  if (tabs > spaces) return { type: 'tabs', size: null }
  let best = null
  for (const [step, count] of steps) {
    if (!best || count > best[1] || (count === best[1] && step < best[0])) best = [step, count]
  }
  if (!best) return null
  // An odd step (e.g. 3) is unusual: round to the nearest supported size.
  const size = SIZES.reduce((a, b) => (Math.abs(b - best[0]) < Math.abs(a - best[0]) ? b : a))
  return { type: 'spaces', size }
}

// The indentation to use: the document's own choice, else what the
// project's .editorconfig says (`config`, see editorconfig.js), else what
// its text suggests, else the default for its file type (`fallback` for
// types without a convention).
export function effectiveIndent(doc, { config = null, fallback } = {}) {
  if (doc?.indent?.type) return { type: doc.indent.type, size: doc.indent.size ?? 4, auto: false }
  if (config?.indent) return { ...config.indent, auto: true, from: 'editorconfig' }
  const def = defaultIndent(doc?.name, fallback)
  const found = detectIndent(doc?.content ?? '')
  const type = found?.type ?? def.type
  // .editorconfig may give just a size.
  const size = config?.indentSize ?? (found?.type === 'spaces' ? found.size : null) ?? def.size
  return { type, size, auto: true, ...(config?.indentSize ? { from: 'editorconfig' } : {}) }
}

export const indentUnitString = ({ type, size }) => (type === 'tabs' ? '\t' : ' '.repeat(size))

export const describeIndent = ({ type, size }) => (type === 'tabs' ? t('indent.tabs', { count: size }) : t('indent.spaces', { count: size }))

// Re-indent every line from one setting to another. Leading whitespace is
// measured in columns (tabs are `from.size` wide) and rewritten; partial
// steps stay as spaces. Returns the new text.
export function convertIndentation(text, from, to) {
  return text.replace(/^[ \t]+/gm, (ws) => {
    let col = 0
    for (const ch of ws) col = ch === '\t' ? col + from.size - (col % from.size) : col + 1
    // Spaces count as indent levels in the old width, so 4-space code
    // becomes 2-space code, not just re-tabbed.
    const levels = Math.floor(col / from.size)
    const rest = col % from.size
    if (to.type === 'tabs') return '\t'.repeat(levels) + ' '.repeat(rest)
    return ' '.repeat(levels * to.size + rest)
  })
}
