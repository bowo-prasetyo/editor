// Line and text commands: sort, remove duplicates, reverse, join lines,
// change case, and the whitespace fixes applied when saving to a file.
// They are plain CodeMirror state commands ({ state, dispatch } => boolean),
// so they're easy to test, and each one is a single undoable edit.
import { EditorSelection, EditorState } from '@codemirror/state'

// --- Which lines a command works on ------------------------------------------

// Blocks of whole lines covered by the selection: [{ from, to }] as line
// numbers, merged where they touch. A selection that ends at the very start
// of a line doesn't include that line. With nothing selected, `whole`
// gives the whole document, otherwise each cursor's own line.
export function lineBlocks(state, { whole = false } = {}) {
  const { doc, selection } = state
  if (whole && selection.ranges.every((r) => r.empty)) return [{ from: 1, to: doc.lines }]
  const blocks = []
  for (const r of selection.ranges) {
    const from = doc.lineAt(r.from).number
    let to = doc.lineAt(r.to).number
    if (!r.empty && to > from && doc.line(to).from === r.to) to--
    const last = blocks.at(-1)
    if (last && from <= last.to + 1) last.to = Math.max(last.to, to)
    else blocks.push({ from, to })
  }
  return blocks.sort((a, b) => a.from - b.from)
}

// Replace each block of lines with fn(lines), as one edit. The selection
// then covers the changed lines.
function mapLineBlocks({ state, dispatch }, fn, options) {
  if (state.readOnly) return false
  const changes = []
  const ranges = []
  let shift = 0
  for (const { from, to } of lineBlocks(state, options)) {
    const start = state.doc.line(from).from
    const end = state.doc.line(to).to
    const lines = []
    for (let n = from; n <= to; n++) lines.push(state.doc.line(n).text)
    const insert = fn(lines).join(state.lineBreak)
    if (insert !== state.sliceDoc(start, end)) changes.push({ from: start, to: end, insert })
    ranges.push(EditorSelection.range(start + shift, start + shift + insert.length))
    shift += insert.length - (end - start)
  }
  if (!changes.length) return false
  dispatch(state.update({ changes, selection: EditorSelection.create(ranges), scrollIntoView: true, userEvent: 'input' }))
  return true
}

// --- Sorting and friends ------------------------------------------------------------

// Natural order ("file2" before "file10"); case only breaks ties unless
// `ignoreCase`.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'variant' })
const caseless = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export const sortLinesBy = (lines, { descending = false, ignoreCase = false } = {}) => {
  const c = ignoreCase ? caseless : collator
  const sorted = [...lines].sort((a, b) => c.compare(a, b))
  return descending ? sorted.reverse() : sorted
}

// Keeps the first of each repeated line.
export const uniqueLines = (lines) => [...new Set(lines)]

// With nothing selected these work on the whole document.
export const sortLinesAscending = (t) => mapLineBlocks(t, (l) => sortLinesBy(l), { whole: true })
export const sortLinesDescending = (t) => mapLineBlocks(t, (l) => sortLinesBy(l, { descending: true }), { whole: true })
export const sortLinesIgnoreCase = (t) => mapLineBlocks(t, (l) => sortLinesBy(l, { ignoreCase: true }), { whole: true })
export const removeDuplicateLines = (t) => mapLineBlocks(t, uniqueLines, { whole: true })
export const reverseLines = (t) => mapLineBlocks(t, (l) => [...l].reverse(), { whole: true })

// --- Join lines -----------------------------------------------------------------

// Join the selected lines into one (or, with just a cursor, its line and the
// next), with a single space where they meet: the end of one line and the
// indentation of the next are dropped. Blank lines join without a space.
export function joinLines({ state, dispatch }) {
  if (state.readOnly) return false
  const { doc } = state
  const changes = []
  const cursors = []
  for (const r of state.selection.ranges) {
    const first = doc.lineAt(r.from).number
    let last = doc.lineAt(r.to).number
    if (!r.empty && last > first && doc.line(last).from === r.to) last--
    if (last === first) last = Math.min(first + 1, doc.lines)
    // Blank lines vanish; a space only goes between two bits of text.
    let hasText = doc.line(first).text.trim() !== ''
    for (let n = first; n < last; n++) {
      const line = doc.line(n)
      const next = doc.line(n + 1)
      const kept = line.text.trimEnd()
      const rest = next.text.trimStart()
      const from = line.from + kept.length
      const to = next.to - rest.length
      const insert = hasText && rest ? ' ' : ''
      if (rest) hasText = true
      changes.push({ from, to, insert })
      if (r.empty && n === first) cursors.push({ at: from, len: insert.length })
    }
  }
  if (!changes.length) return false
  const changeSet = state.changes(changes)
  // A lone cursor ends up where the lines were joined.
  const selection = state.selection.ranges.every((r) => r.empty) && cursors.length
    ? EditorSelection.create(cursors.map((c) => EditorSelection.cursor(changeSet.mapPos(c.at, -1) + c.len)))
    : state.selection.map(changeSet)
  dispatch(state.update({ changes: changeSet, selection, scrollIntoView: true, userEvent: 'input' }))
  return true
}

// --- Change case ----------------------------------------------------------------

export const toTitleCase = (s) =>
  s.toLowerCase().replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase())

// Change the case of each selection; a cursor changes the word it's in.
function changeCase({ state, dispatch }, fn) {
  if (state.readOnly) return false
  const changes = []
  const ranges = []
  for (const r of state.selection.ranges) {
    const target = r.empty ? state.wordAt(r.head) : r
    if (!target) {
      ranges.push(r)
      continue
    }
    const text = state.sliceDoc(target.from, target.to)
    const insert = fn(text)
    // Some letters change length (ß -> SS): keep the selection on the new text.
    if (insert !== text) changes.push({ from: target.from, to: target.to, insert })
    ranges.push({ r, target, len: insert.length })
  }
  if (!changes.length) return false
  const changeSet = state.changes(changes)
  const selection = EditorSelection.create(
    ranges.map((x) => {
      if (!x.target) return x.map(changeSet)
      const from = changeSet.mapPos(x.target.from, -1)
      return x.r.empty ? EditorSelection.cursor(changeSet.mapPos(x.r.head, 1)) : EditorSelection.range(from, from + x.len)
    }),
    state.selection.mainIndex,
  )
  dispatch(state.update({ changes: changeSet, selection, userEvent: 'input' }))
  return true
}

export const upperCase = (t) => changeCase(t, (s) => s.toUpperCase())
export const lowerCase = (t) => changeCase(t, (s) => s.toLowerCase())
export const titleCase = (t) => changeCase(t, toTitleCase)

// --- Whitespace, when saving to a file --------------------------------------------

// Changes that remove spaces and tabs at the ends of lines.
export function trailingWhitespaceChanges(doc) {
  const changes = []
  for (let n = 1; n <= doc.lines; n++) {
    const { text, to } = doc.line(n)
    const m = /[ \t]+$/.exec(text)
    if (m) changes.push({ from: to - m[0].length, to })
  }
  return changes
}

// A change that adds a line break at the end, if the text doesn't end
// with one (an empty document is left alone).
export function finalNewlineChange(doc, lineBreak = '\n') {
  if (!doc.length || doc.line(doc.lines).length === 0) return null
  return { from: doc.length, insert: lineBreak }
}

// Both, as one command: { trim, finalNewline } say which.
export function whitespaceFix({ trim = false, finalNewline = false } = {}) {
  return ({ state, dispatch }) => {
    if (state.readOnly) return false
    const changes = trim ? trailingWhitespaceChanges(state.doc) : []
    const nl = finalNewline && finalNewlineChange(state.doc, state.lineBreak)
    if (nl) changes.push(nl)
    if (!changes.length) return false
    dispatch(state.update({ changes, userEvent: 'input.whitespace' }))
    return true
  }
}

export const trimTrailingWhitespace = whitespaceFix({ trim: true })

// The same, for text not open in an editor.
export function fixWhitespaceText(text, options) {
  let state = EditorState.create({ doc: text })
  whitespaceFix(options)({ state, dispatch: (tr) => (state = tr.state) })
  return state.doc.toString()
}
