// Prose files (notes, letters, Markdown) are wrapped and spell-checked by
// default; anything else is treated as code. A document can override both.
const PROSE = new Set(['', 'txt', 'text', 'md', 'markdown', 'mdown', 'rst', 'adoc', 'org'])

export function extension(name = '') {
  const base = name.trim().split(/[\\/]/).pop()
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function isProse(name) {
  return PROSE.has(extension(name))
}

// Above this size, spell checking is off unless turned on: the browser
// re-checks the whole text as you type, which makes big documents lag.
export const SPELLCHECK_LIMIT = 200_000

// Effective view settings for a document: its own choice, else the default.
export function viewSettings(doc) {
  const prose = isProse(doc?.name)
  const small = (doc?.content?.length ?? 0) <= SPELLCHECK_LIMIT
  return {
    wrap: doc?.wrap ?? prose,
    spellcheck: doc?.spellcheck ?? (prose && small),
  }
}
