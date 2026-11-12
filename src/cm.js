// The text editor: CodeMirror 6, set up for plain text and code without
// syntax highlighting. It handles very large documents (only the visible
// lines are drawn), several cursors, and the usual editing commands.
import { Compartment, EditorSelection, EditorState } from '@codemirror/state'
import {
  EditorView,
  Decoration,
  MatchDecorator,
  ViewPlugin,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { highlightSelectionMatches, selectNextOccurrence, selectSelectionMatches } from '@codemirror/search'
import { commentTokensFor } from './filetype.js'
import { searchRegExp } from './find.js'

export const INDENT = '  '

// --- Commands (plain state commands, so they're easy to test) ---------------

// Tab: with only cursors, insert an indent at each one; with a selection,
// indent every selected line (the selected text is never replaced).
export function indentOrInsert({ state, dispatch }) {
  if (state.readOnly) return false
  if (state.selection.ranges.some((r) => !r.empty)) return indentMore({ state, dispatch })
  const unit = state.facet(indentUnit)
  dispatch(state.update(state.replaceSelection(unit), { scrollIntoView: true, userEvent: 'input.indent' }))
  return true
}

// Enter: a new line indented exactly like the current one (tabs stay tabs),
// copying no more indentation than lies before the cursor.
export function newlineKeepIndent({ state, dispatch }) {
  if (state.readOnly) return false
  dispatch(
    state.update(
      state.changeByRange((range) => {
        const line = state.doc.lineAt(range.from)
        const indent = /^[ \t]*/.exec(line.text)[0].slice(0, range.from - line.from)
        const insert = state.lineBreak + indent
        return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.cursor(range.from + insert.length) }
      }),
      { scrollIntoView: true, userEvent: 'input' },
    ),
  )
  return true
}

// Where "Go to line" input such as "42" or "42:7" (line:column) points, or
// null if it isn't a line number. Lines and columns past the end are clamped.
export function goToPosition(doc, input) {
  const m = /^\s*(\d+)\s*(?:[:,]\s*(\d+)\s*)?$/.exec(input)
  if (!m) return null
  const line = doc.line(Math.min(Math.max(1, +m[1]), doc.lines))
  const col = m[2] ? Math.max(1, +m[2]) : 1
  return line.from + Math.min(col - 1, line.length)
}

// Comment syntax for Ctrl/Cmd+/, from the file name.
export const commentData = (name) => EditorState.languageData.of(() => [{ commentTokens: commentTokensFor(name) }])

// Editing behaviour that doesn't need a page: several cursors, two-space
// indents. (Exported for tests.)
export const editingSetup = () => [
  EditorState.allowMultipleSelections.of(true),
  indentUnit.of(INDENT),
  EditorState.tabSize.of(INDENT.length),
]

// --- Look ----------------------------------------------------------------

// Colours come from the page's CSS variables, so light and dark both work.
const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--fg)', backgroundColor: 'var(--bg)', fontSize: 'inherit' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--fg)' },
  '.cm-line': { padding: '0 12px' },
  '.cm-gutters': { backgroundColor: 'var(--panel)', color: 'var(--muted)', borderRight: '1px solid var(--border)' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 12px', minWidth: '3ch' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--accent) 12%, var(--panel))', color: 'var(--fg)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent) !important',
  },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)' },
  '.cm-findMatch': {
    backgroundColor: 'color-mix(in srgb, #f5c400 40%, transparent)',
    outline: '1px solid color-mix(in srgb, #c99a00 70%, transparent)',
    borderRadius: '2px',
  },
})

// --- Find highlighting ----------------------------------------------------

// Every match of the find bar's query is highlighted. (CodeMirror's own
// search highlighting only works with its search panel, which we don't use.)
const findMark = Decoration.mark({ class: 'cm-findMatch' })
function findHighlighter(re) {
  if (!re) return []
  const decorator = new MatchDecorator({ regexp: re, decoration: findMark, maxLength: 2000 })
  return ViewPlugin.define(
    (view) => ({
      decorations: decorator.createDeco(view),
      update(u) {
        this.decorations = decorator.updateDeco(u, this.decorations)
      },
    }),
    { decorations: (v) => v.decorations },
  )
}

// --- The editor -----------------------------------------------------------

// options: { parent, text, name, wrap, spellcheck, onChange(text), onSelection(info) }
// Returns a small API used by the editor page and the find bar.
export function createEditor({ parent, text, name, wrap, spellcheck, onChange, onSelection }) {
  const wrapping = new Compartment()
  const spelling = new Compartment()
  const language = new Compartment()
  const finding = new Compartment()

  const spellAttrs = (on) => EditorView.contentAttributes.of({ spellcheck: on ? 'true' : 'false' })

  // The document text as last handed to or received from the page, so the
  // page can tell its own echo from a real outside change cheaply.
  let synced = text

  const report = (state) => {
    const ranges = state.selection.ranges
    const head = state.selection.main.head
    const line = state.doc.lineAt(head)
    onSelection?.({
      line: line.number,
      col: head - line.from + 1,
      cursors: ranges.length,
      selected: ranges.reduce((n, r) => n + r.to - r.from, 0),
      lines: state.doc.lines,
    })
  }

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        editingSetup(),
        rectangularSelection(), // Alt+drag: block selection
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([
          { key: 'Enter', run: newlineKeepIndent },
          { key: 'Tab', run: indentOrInsert, shift: indentLess },
          { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
          { key: 'Mod-Shift-l', run: selectSelectionMatches, preventDefault: true },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        theme,
        wrapping.of(wrap ? EditorView.lineWrapping : []),
        spelling.of(spellAttrs(spellcheck)),
        language.of(commentData(name)),
        finding.of([]),
        EditorView.contentAttributes.of({ 'aria-label': 'Document text', autocapitalize: 'off' }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            synced = u.state.doc.toString()
            onChange?.(synced)
          }
          if (u.docChanged || u.selectionSet) report(u.state)
        }),
      ],
    }),
  })
  report(view.state)

  const selection = () => view.state.selection.main

  return {
    view,
    focus: () => view.focus(),
    destroy: () => view.destroy(),
    hasFocus: () => view.hasFocus,

    setWrap: (on) => view.dispatch({ effects: wrapping.reconfigure(on ? EditorView.lineWrapping : []) }),
    setSpellcheck: (on) => view.dispatch({ effects: spelling.reconfigure(spellAttrs(on)) }),
    setName: (n) => view.dispatch({ effects: language.reconfigure(commentData(n)) }),

    // Replace the whole text after a change made elsewhere (another tab, a
    // recovered copy). Ignores the page echoing back our own text.
    setText(next) {
      if (next === synced) return
      synced = next
      const { from, to } = selection()
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: EditorSelection.single(Math.min(from, next.length), Math.min(to, next.length)),
      })
    },

    // For the find bar.
    getText: () => synced,
    getSelection: () => ({ from: selection().from, to: selection().to }),
    select(from, to, { focus = false } = {}) {
      view.dispatch({ selection: EditorSelection.single(from, to), scrollIntoView: true })
      if (focus) view.focus()
    },
    // An undoable edit. Collapses multiple cursors to one.
    replace(from, to, insert, { select = true } = {}) {
      const end = from + insert.length
      view.dispatch({
        changes: { from, to, insert },
        selection: select ? EditorSelection.single(end) : undefined,
        scrollIntoView: true,
        userEvent: 'input.replace',
      })
    },
    highlight(query, options) {
      view.dispatch({ effects: finding.reconfigure(findHighlighter(searchRegExp(query, options))) })
    },

    goTo(input) {
      const pos = goToPosition(view.state.doc, input)
      if (pos == null) return false
      view.dispatch({ selection: EditorSelection.single(pos), scrollIntoView: true })
      view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) })
      view.focus()
      return true
    },
  }
}
