// Checking JSON and YAML as you type: problems are underlined, marked in
// the gutter and listed with Ctrl/Cmd+Shift+M. Each checker is loaded only
// when a document needs it.

// JSON files that are allowed comments and trailing commas (JSONC): not
// checked, since strict JSON would flag every comment.
const JSONC = /(^|\/)(tsconfig[^/]*|jsconfig[^/]*|\.eslintrc|\.babelrc|devcontainer|settings|launch|tasks|extensions|keybindings)\.json$|\.jsonc$|\.json5$/i

// Which checker suits a document: 'json', 'yaml' or null.
export function lintKind(name = '', language = '') {
  const lower = name.toLowerCase()
  if (language === 'JSON' || /\.(json|webmanifest|har)$|^\.?(babelrc|prettierrc)$/.test(lower)) {
    return JSONC.test(lower) ? null : 'json'
  }
  if (language === 'YAML' || /\.ya?ml$/.test(lower)) return 'yaml'
  return null
}

// A range of at least one character where the text allows, so a problem at
// the very end (a missing closing quote) still shows.
function span(text, from, to) {
  from = Math.max(0, Math.min(from, text.length))
  to = Math.min(Math.max(to, from + 1), text.length)
  if (to <= from && from > 0) from = to - 1
  return { from, to }
}

// A position in the text from a 1-based line and column.
function offsetAt(text, line, col) {
  let pos = 0
  for (let n = 1; n < line; n++) {
    const next = text.indexOf('\n', pos)
    if (next === -1) return text.length
    pos = next + 1
  }
  return Math.min(text.length, pos + Math.max(0, col - 1))
}

// Problems in JSON text: [{ from, to, severity, message }].
export function jsonProblems(text) {
  if (!text.trim()) return []
  try {
    JSON.parse(text)
    return []
  } catch (e) {
    const msg = String(e.message)
    // Engines say where differently: "at position 12", "(line 2 column 5)".
    let pos = null
    const p = /position (\d+)/.exec(msg)
    const lc = /line (\d+) column (\d+)/.exec(msg)
    if (p) pos = +p[1]
    else if (lc) pos = offsetAt(text, +lc[1], +lc[2])
    else pos = text.length
    const message = msg.replace(/^JSON\.parse: /, '').replace(/ in JSON at position \d+.*$/, '').replace(/\s*\(line \d+ column \d+\)/, '')
    return [{ ...span(text, pos, pos + 1), severity: 'error', message }]
  }
}

// Problems in YAML text (all documents in it), using the yaml package.
export async function yamlProblems(text) {
  const { parseAllDocuments } = await import('yaml')
  const out = []
  for (const doc of parseAllDocuments(text, { prettyErrors: false })) {
    for (const [list, severity] of [[doc.errors, 'error'], [doc.warnings, 'warning']]) {
      for (const e of list) {
        const [from = 0, to = from + 1] = e.pos ?? []
        out.push({
          ...span(text, from, to),
          severity,
          message: String(e.message).split('\n')[0],
        })
      }
    }
  }
  return out
}

// A CodeMirror lint source for the kind, or null.
export function lintSource(kind) {
  if (kind === 'json') return (view) => jsonProblems(view.state.doc.toString())
  if (kind === 'yaml') return (view) => yamlProblems(view.state.doc.toString())
  return null
}
