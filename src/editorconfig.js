// EditorConfig (https://editorconfig.org): a project's .editorconfig files
// say how its files are indented and saved. Supported properties:
//   indent_style (tab | space), indent_size (a number, or "tab"), tab_width,
//   trim_trailing_whitespace, insert_final_newline (true | false).
// Others are ignored. Files in folders closer to the file win, and a file
// with "root = true" stops the search for more above it.

// { root: boolean, sections: [{ glob, props }] } from an .editorconfig's text.
export function parseEditorConfig(text) {
  const out = { root: false, sections: [] }
  let section = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    const head = /^\[(.*)\]$/.exec(line)
    if (head) {
      section = { glob: head[1].trim(), props: {} }
      out.sections.push(section)
      continue
    }
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim().toLowerCase()
    // Values are case-insensitive; inline comments aren't part of the spec,
    // but " # …" after a value is common, so drop it.
    const value = line.slice(eq + 1).replace(/\s[#;].*$/, '').trim().toLowerCase()
    if (section) section.props[key] = value
    else if (key === 'root') out.root = value === 'true'
  }
  return out
}

// "{a,b}" alternatives and "{1..3}" number ranges, as RegExp source.
function braces(body) {
  const range = /^(-?\d+)\.\.(-?\d+)$/.exec(body)
  if (range) {
    const [a, b] = [+range[1], +range[2]].sort((x, y) => x - y)
    if (b - a <= 1000) return `(?:${Array.from({ length: b - a + 1 }, (_, i) => a + i).join('|')})`
  }
  // Split on top-level commas.
  const parts = []
  let depth = 0
  let cur = ''
  for (const ch of body) {
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
      continue
    }
    if (ch === '{') depth++
    if (ch === '}') depth--
    cur += ch
  }
  parts.push(cur)
  if (parts.length === 1) return `\\{${globToSource(body)}\\}` // "{x}" is literal
  return `(?:${parts.map(globToSource).join('|')})`
}

// An EditorConfig glob as RegExp source: * any characters but "/", ** any,
// ? one character, [abc] / [!abc] a set, {a,b} alternatives, {1..3} ranges.
export function globToSource(glob) {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '\\' && i + 1 < glob.length) {
      out += glob[++i].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    } else if (c === '*') {
      if (glob[i + 1] === '*') {
        i++
        // "**/" also matches no folder at all.
        if (glob[i + 1] === '/') {
          i++
          out += '(?:.*/)?'
        } else out += '.*'
      } else out += '[^/]*'
    } else if (c === '?') out += '[^/]'
    else if (c === '[') {
      const end = glob.indexOf(']', i + 1)
      if (end === -1) out += '\\['
      else {
        let set = glob.slice(i + 1, end)
        const negate = set.startsWith('!')
        if (negate) set = set.slice(1)
        out += `[${negate ? '^' : ''}${set.replace(/[\\\]^]/g, '\\$&')}]`
        i = end
      }
    } else if (c === '{') {
      // Find the matching "}".
      let depth = 1
      let j = i + 1
      for (; j < glob.length && depth; j++) {
        if (glob[j] === '{') depth++
        if (glob[j] === '}') depth--
      }
      if (depth) out += '\\{'
      else {
        out += braces(glob.slice(i + 1, j - 1))
        i = j - 1
      }
    } else out += c.replace(/[.+^$()|\]\\/]/g, '\\$&')
  }
  return out
}

// Does a section's glob cover `path` (relative to the .editorconfig's folder)?
// A glob without "/" matches the file name in any folder below; one with
// "/" is matched from the .editorconfig's folder.
export function globMatches(glob, path) {
  let g = glob
  if (!g.includes('/')) g = `**/${g}`
  else if (g.startsWith('/')) g = g.slice(1)
  try {
    return new RegExp(`^${globToSource(g)}$`).test(path)
  } catch {
    return false
  }
}

// The properties for a file. `configs` are [{ dir, config }] from the
// folder nearest the root down to the file's folder (dir: path from the
// root, '' for the root itself); `path` is the file's path from the root.
export function propertiesFor(configs, path) {
  // Only those below the nearest "root = true".
  let start = 0
  for (let i = configs.length - 1; i >= 0; i--) {
    if (configs[i].config.root) {
      start = i
      break
    }
  }
  const props = {}
  for (const { dir, config } of configs.slice(start)) {
    if (dir && !path.startsWith(dir + '/')) continue // not a folder the file is in
    const rel = dir ? path.slice(dir.length + 1) : path
    for (const s of config.sections) if (globMatches(s.glob, rel)) Object.assign(props, s.props)
  }
  return props
}

// What the editor uses from them: { indent?: { type, size }, trim?, finalNewline? }.
// "unset" (or a value we don't understand) leaves a property to the editor.
export function editorSettings(props) {
  const out = {}
  const num = (v) => (/^\d+$/.test(v ?? '') && +v > 0 ? Math.min(+v, 16) : null)
  const style = props.indent_style
  const tabWidth = num(props.tab_width)
  const size = props.indent_size === 'tab' ? tabWidth : num(props.indent_size)
  if (style === 'tab') out.indent = { type: 'tabs', size: tabWidth ?? size ?? 4 }
  else if (style === 'space') out.indent = { type: 'spaces', size: size ?? tabWidth ?? 4 }
  else if (size) out.indentSize = size // only a size: applies to whatever the file uses
  const bool = (v) => (v === 'true' ? true : v === 'false' ? false : undefined)
  const trim = bool(props.trim_trailing_whitespace)
  const finalNewline = bool(props.insert_final_newline)
  if (trim !== undefined) out.trim = trim
  if (finalNewline !== undefined) out.finalNewline = finalNewline
  return out
}
