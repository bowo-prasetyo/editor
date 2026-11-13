// Writing helpers for Markdown documents (see docs/markdown.md). Each acts
// only on the selection or the cursor, in one undoable step, and never
// touches other text.
import { EditorSelection } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'

// How many "*" in a row end `text` / start `text`.
const starsAtEnd = (text) => text.length - text.replace(/\*+$/, '').length
const starsAtStart = (text) => text.length - text.replace(/^\*+/, '').length

// Is text wrapped in `n` stars (on each side) "bold" or "italic"?
// 1 = italic, 2 = bold, 3 = both.
const has = (n, kind) => (kind === 'bold' ? n >= 2 : n === 1 || n === 3)

// Wrap the selection in **…** (bold) or *…* (italic), or unwrap it if it's
// already wrapped (inside or just outside the selection). With nothing
// selected, insert the pair with the cursor between (or remove an empty pair
// around the cursor).
export function toggleEmphasis(view, kind) {
  const marker = kind === 'bold' ? '**' : '*'
  const len = marker.length
  const { state } = view
  const tr = state.changeByRange((range) => {
    const doc = state.doc
    const text = doc.sliceString(range.from, range.to)
    const before = doc.sliceString(Math.max(0, range.from - 3), range.from)
    const after = doc.sliceString(range.to, Math.min(doc.length, range.to + 3))
    const outside = Math.min(starsAtEnd(before), starsAtStart(after))

    if (range.empty) {
      // An empty pair around the cursor ("**|**"): take it away.
      if (outside && has(outside, kind) && outside >= len) {
        return {
          changes: [{ from: range.from - len, to: range.from }, { from: range.to, to: range.to + len }],
          range: EditorSelection.cursor(range.from - len),
        }
      }
      return { changes: { from: range.from, insert: marker + marker }, range: EditorSelection.cursor(range.from + len) }
    }

    // Wrapped inside the selection: "[**bold**]".
    const inside = Math.min(starsAtStart(text), starsAtEnd(text))
    if (inside && has(inside, kind) && text.length > 2 * inside) {
      return {
        changes: [{ from: range.from, to: range.from + len }, { from: range.to - len, to: range.to }],
        range: EditorSelection.range(range.from, range.to - 2 * len),
      }
    }
    // Wrapped just outside it: "**[bold]**".
    if (outside && has(outside, kind)) {
      return {
        changes: [{ from: range.from - len, to: range.from }, { from: range.to, to: range.to + len }],
        range: EditorSelection.range(range.from - len, range.to - len),
      }
    }
    return {
      changes: [{ from: range.from, insert: marker }, { from: range.to, insert: marker }],
      range: EditorSelection.range(range.from + len, range.to + len),
    }
  })
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }))
  return true
}

export const toggleBold = (view) => toggleEmphasis(view, 'bold')
export const toggleItalic = (view) => toggleEmphasis(view, 'italic')

// --- Lists continue on Enter ---------------------------------------------------------

// A list item's start: indentation, marker ("-", "*", "+", "1." or "1)"), the
// space after it, and a task box ("[ ]", "[x]").
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(\[[ xX]\](?:\s+|$))?/
// A quote's start: one or more ">".
const QUOTE = /^\s*(?:>\s?)+/

// Inside a code block, lines that look like list items aren't.
function inCode(state, pos) {
  for (let n = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (/^(FencedCode|CodeBlock|CodeText|InlineCode)$/.test(n.name)) return true
  }
  return false
}

// What to do with Enter at `pos`: null (not in a list or quote), or
// { line, prefix, next, empty }.
function listAt(state, pos) {
  const line = state.doc.lineAt(pos)
  let prefix, next
  const m = LIST.exec(line.text)
  if (m) {
    const [whole, indent, marker, space, task] = m
    prefix = whole
    const number = /^\d/.test(marker) ? `${parseInt(marker, 10) + 1}${marker.slice(-1)}` : marker
    next = indent + number + space + (task ? '[ ] ' : '')
  } else {
    const q = QUOTE.exec(line.text)
    if (!q) return null
    prefix = next = q[0]
  }
  if (pos - line.from < prefix.length) return null // the cursor is in the marker
  if (inCode(state, pos)) return null
  return { line, prefix, next, empty: !line.text.slice(prefix.length).trim() }
}

// Enter in a list item or a quote: start the next one ("- ", "2. ", "- [ ] ",
// "> "). On an empty item, end the list instead: the marker goes, leaving an
// empty line. Other lines are never changed: an ordered list isn't
// renumbered (unlike CodeMirror's insertNewlineContinueMarkup). Returns false
// (so Enter does its usual thing) unless every cursor is in a list or quote.
export function continueList(view) {
  const { state } = view
  const ranges = state.selection.ranges
  if (ranges.some((r) => !r.empty)) return false
  const plans = ranges.map((r) => listAt(state, r.head))
  if (plans.some((p) => !p)) return false
  let i = 0
  const tr = state.changeByRange((range) => {
    const p = plans[i++]
    if (p.empty) {
      return { changes: { from: p.line.from, to: p.line.to }, range: EditorSelection.cursor(p.line.from) }
    }
    const insert = state.lineBreak + p.next
    return { changes: { from: range.head, insert }, range: EditorSelection.cursor(range.head + insert.length) }
  })
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input' }))
  return true
}

// --- Headings ------------------------------------------------------------------------

// The document's headings, in order: [{ level, text, from }]. Parsed in full
// (up to a moment's work), so headings far down a long document are there;
// "#" in a code block isn't a heading.
export function headings(state) {
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state)
  const out = []
  tree.iterate({
    enter(node) {
      const m = /^(ATXHeading|SetextHeading)(\d)$/.exec(node.name)
      if (!m) return
      const first = state.doc.sliceString(node.from, node.to).split('\n')[0]
      const text = first.replace(/^\s*#+\s*/, '').replace(/\s+#+\s*$/, '').trim()
      out.push({ level: +m[2], text, from: node.from })
      return false
    },
  })
  return out
}
