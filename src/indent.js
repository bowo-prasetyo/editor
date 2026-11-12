// Pure helpers for Tab / Shift+Tab in a <textarea>.
//
// Each returns an edit description, or null when nothing would change:
//   { from, to, insert, selStart, selEnd }
// meaning "replace value.slice(from, to) with insert, then select selStart..selEnd".
// Keeping this free of DOM access makes it easy to test, and lets the caller
// apply the edit in a way that preserves the browser's undo history.

export const INDENT = '  '

// Range of whole lines touched by the selection. A selection that ends right
// at the start of a line (e.g. after triple-click) does not include that line.
function lineBlock(value, start, end) {
  const from = value.lastIndexOf('\n', start - 1) + 1
  const last = end > start && value[end - 1] === '\n' ? end - 1 : end
  const nl = value.indexOf('\n', last)
  return { from, to: nl === -1 ? value.length : nl }
}

// Map a position in the old block to the new block, given per-line changes.
function mapPos(lines, deltas, offset, keepAtLineStart) {
  let lineStart = 0
  let shift = 0
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = lineStart + lines[i].length
    if (offset <= lineEnd || i === lines.length - 1) {
      const col = offset - lineStart
      const d = deltas[i]
      if (d >= 0) return lineStart + shift + (col === 0 && keepAtLineStart ? 0 : col + d)
      return lineStart + shift + Math.max(0, col + d)
    }
    shift += deltas[i]
    lineStart = lineEnd + 1
  }
  return offset + shift
}

function edit(value, start, end, transform) {
  const { from, to } = lineBlock(value, start, end)
  const lines = value.slice(from, to).split('\n')
  const next = lines.map(transform)
  const deltas = next.map((l, i) => l.length - lines[i].length)
  if (deltas.every((d) => d === 0)) return null
  return {
    from,
    to,
    insert: next.join('\n'),
    // When the selection starts at column 0, keep it there so the new
    // indentation is part of the selection (as in most code editors).
    selStart: from + mapPos(lines, deltas, start - from, end > start),
    selEnd: from + mapPos(lines, deltas, end - from, false),
  }
}

// Tab: with no selection, insert an indent at the caret. With a selection,
// indent every touched line instead of replacing the selected text.
export function indentEdit(value, start, end, unit = INDENT) {
  if (start === end) {
    return { from: start, to: end, insert: unit, selStart: start + unit.length, selEnd: start + unit.length }
  }
  return edit(value, start, end, (line) => (line === '' ? line : unit + line))
}

// Shift+Tab: remove one level of indentation (a tab, or up to `unit` spaces)
// from every touched line.
export function outdentEdit(value, start, end, unit = INDENT) {
  return edit(value, start, end, (line) => {
    if (line.startsWith('\t')) return line.slice(1)
    let n = 0
    while (n < unit.length && line[n] === ' ') n++
    return line.slice(n)
  })
}
