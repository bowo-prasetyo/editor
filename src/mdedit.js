// Writing helpers for Markdown documents (see docs/markdown.md). Each acts
// only on the selection or the cursor, in one undoable step, and never
// touches other text.
import { EditorSelection } from '@codemirror/state'

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
