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
// `defaults`: whether prose and code wrap unless the document says (settings).
export function viewSettings(doc, { wrapProse = true, wrapCode = false } = {}) {
  const prose = isProse(doc?.name)
  const small = (doc?.content?.length ?? 0) <= SPELLCHECK_LIMIT
  return {
    wrap: doc?.wrap ?? (prose ? wrapProse : wrapCode),
    spellcheck: doc?.spellcheck ?? (prose && small),
  }
}

// How to comment out a line, by file extension, for Ctrl/Cmd+/. Files without
// line comments use block comments; unknown types use "#" (config files,
// scripts and notes most often do).
const SLASHES = { line: '//', block: { open: '/*', close: '*/' } }
const HASH = { line: '#' }
const HTML = { block: { open: '<!--', close: '-->' } }
const COMMENTS = {
  ...Object.fromEntries(
    ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'java', 'kt', 'kts', 'scala',
      'go', 'rs', 'swift', 'dart', 'php', 'jsonc', 'json5', 'scss', 'less', 'groovy', 'gradle', 'proto', 'zig']
      .map((e) => [e, SLASHES]),
  ),
  ...Object.fromEntries(
    ['py', 'rb', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'pl', 'r', 'yaml', 'yml', 'toml', 'conf', 'cfg', 'env',
      'gitignore', 'dockerignore', 'properties', 'mk', 'nix', 'tf', 'cmake', 'coffee', 'jl', 'ex', 'exs', 'nim']
      .map((e) => [e, HASH]),
  ),
  ...Object.fromEntries(['sql', 'lua', 'hs', 'elm', 'ada'].map((e) => [e, { line: '--' }])),
  ...Object.fromEntries(['tex', 'sty', 'bib', 'm', 'erl'].map((e) => [e, { line: '%' }])),
  ...Object.fromEntries(['ini', 'lisp', 'clj', 'cljs', 'el', 'scm', 'asm', 's'].map((e) => [e, { line: ';' }])),
  ...Object.fromEntries(['html', 'htm', 'xml', 'svg', 'vue', 'svelte', 'md', 'markdown', 'mdown'].map((e) => [e, HTML])),
  css: { block: SLASHES.block },
  bat: { line: 'REM' },
  cmd: { line: 'REM' },
  vb: { line: "'" },
  vim: { line: '"' },
}
const BY_NAME = { dockerfile: HASH, makefile: HASH, gemfile: HASH, rakefile: HASH, '.gitignore': HASH, '.env': HASH }

export function commentTokensFor(name = '') {
  const base = name.trim().split(/[\\/]/).pop().toLowerCase()
  return BY_NAME[base] ?? COMMENTS[extension(name)] ?? HASH
}
