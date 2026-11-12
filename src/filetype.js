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

// Effective view settings for a document: its own choice, else the default.
export function viewSettings(doc) {
  const prose = isProse(doc?.name)
  return {
    wrap: doc?.wrap ?? prose,
    spellcheck: doc?.spellcheck ?? prose,
  }
}
