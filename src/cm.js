// The text editor: CodeMirror 6, set up for plain text and code, with
// syntax highlighting for the document's language (see languages.js). It
// handles very large documents (only the visible lines are drawn), several
// cursors, and the usual editing commands.
import { Compartment, EditorSelection, EditorState, Facet, Prec, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import {
  EditorView,
  Decoration,
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
import {
  addCursorAbove,
  addCursorBelow,
  copyLineDown,
  copyLineUp,
  cursorMatchingBracket,
  defaultKeymap,
  deleteLine,
  history,
  historyKeymap,
  indentLess,
  indentMore,
  insertNewlineAndIndent,
  moveLineDown,
  moveLineUp,
  redo,
  selectLine,
  toggleComment,
  undo,
} from '@codemirror/commands'
import { HighlightStyle, bracketMatching, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { highlightSelectionMatches, selectNextOccurrence, selectSelectionMatches } from '@codemirror/search'
import { commentTokensFor } from './filetype.js'
import { indentUnitString } from './indentation.js'

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
// The loaded language's own comment syntax wins (it also knows about
// embedded languages, like CSS inside HTML); this is the fallback.
export const commentData = (name) =>
  Prec.lowest(EditorState.languageData.of(() => [{ commentTokens: commentTokensFor(name) }]))

// Editing behaviour that doesn't need a page: several cursors, two-space
// indents. (Exported for tests.)
export const editingSetup = (indent = { type: 'spaces', size: INDENT.length }) => [
  EditorState.allowMultipleSelections.of(true),
  indentSettings(indent),
]

// The indent unit Tab inserts ("\t" or spaces) and how wide a tab is drawn.
export const indentSettings = (indent) => [
  indentUnit.of(indentUnitString(indent)),
  EditorState.tabSize.of(indent.size),
]

// True when a code language is loaded: Enter then indents by the language's
// rules (an extra level after "{", "(" or ":"). Otherwise Enter copies the
// current line's indentation.
export const smartEnter = Facet.define({ combine: (values) => values.some(Boolean) })

export function enter(target) {
  return target.state.facet(smartEnter) ? insertNewlineAndIndent(target) : newlineKeepIndent(target)
}

// Editing commands the command palette can run by name.
export const EDITOR_COMMANDS = {
  toggleComment,
  moveLineUp,
  moveLineDown,
  copyLineUp,
  copyLineDown,
  deleteLine,
  indentMore,
  indentLess,
  selectNextOccurrence,
  selectSelectionMatches,
  addCursorAbove,
  addCursorBelow,
  cursorMatchingBracket,
  selectLine,
  undo,
  redo,
}

// --- Look ----------------------------------------------------------------

// Colours come from the page's CSS variables, so light and dark both work.
export const theme = EditorView.theme({
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
  '&.cm-focused .cm-matchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent)',
    outline: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)',
  },
  '&.cm-focused .cm-nonmatchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--danger) 22%, transparent)',
  },
  '.cm-findMatch': {
    backgroundColor: 'color-mix(in srgb, #f5c400 40%, transparent)',
    outline: '1px solid color-mix(in srgb, #c99a00 70%, transparent)',
    borderRadius: '2px',
  },
})

// Syntax colours, as CSS variables defined in style.css for light and dark.
const syntax = (v) => ({ color: `var(--syn-${v})` })
export const highlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], ...syntax('keyword') },
  { tag: [t.string, t.special(t.string), t.regexp, t.character, t.attributeValue], ...syntax('string') },
  { tag: [t.number, t.bool, t.null, t.atom, t.unit], ...syntax('number') },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], ...syntax('comment'), fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], ...syntax('function') },
  { tag: [t.typeName, t.className, t.namespace, t.tagName, t.standard(t.tagName)], ...syntax('type') },
  { tag: [t.propertyName, t.attributeName, t.labelName], ...syntax('property') },
  { tag: [t.definition(t.variableName), t.constant(t.variableName), t.self], ...syntax('variable') },
  { tag: [t.operator, t.punctuation, t.separator, t.angleBracket], ...syntax('punctuation') },
  { tag: [t.meta, t.processingInstruction, t.annotation], ...syntax('meta') },
  { tag: [t.escape, t.special(t.variableName)], ...syntax('escape') },
  { tag: t.heading, ...syntax('heading'), fontWeight: 'bold' },
  { tag: [t.link, t.url], ...syntax('link'), textDecoration: 'underline' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.inserted], ...syntax('inserted') },
  { tag: [t.deleted, t.invalid], ...syntax('deleted') },
])

// --- Find highlighting ----------------------------------------------------

// Every match the find bar found is highlighted. It hands over its list of
// matches (sorted [start, end] pairs), so what's highlighted is exactly what
// it counts, including matches that span lines. Until it sends a new list,
// edits shift the old one along with the text.
const setFindMatches = StateEffect.define()
export const findMatchesField = StateField.define({
  create: () => [],
  update(list, tr) {
    for (const e of tr.effects) if (e.is(setFindMatches)) return e.value
    if (!tr.docChanged || !list.length) return list
    return list.map(([from, to]) => [tr.changes.mapPos(from, 1), Math.max(tr.changes.mapPos(from, 1), tr.changes.mapPos(to, -1))])
  },
})

const findMark = Decoration.mark({ class: 'cm-findMatch' })

// Decorations for the matches on screen only (there can be 100,000).
function visibleFindMarks(view) {
  const list = view.state.field(findMatchesField)
  const builder = new RangeSetBuilder()
  if (!list.length) return builder.finish()
  for (const { from, to } of view.visibleRanges) {
    // First match ending after `from` (binary search).
    let lo = 0
    let hi = list.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (list[mid][1] <= from) lo = mid + 1
      else hi = mid
    }
    for (let i = lo; i < list.length && list[i][0] < to; i++) {
      const [s, e] = list[i]
      if (e > s) builder.add(s, e, findMark) // empty matches (e.g. "^") have nothing to colour
    }
  }
  return builder.finish()
}

const findHighlighter = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = visibleFindMarks(view)
    }
    update(u) {
      if (u.docChanged || u.viewportChanged || u.startState.field(findMatchesField) !== u.state.field(findMatchesField)) {
        this.decorations = visibleFindMarks(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

// --- The editor -----------------------------------------------------------

// Settings that change after creation. Shared by all editors, so a saved
// editor state (see snapshot()) can be resumed by a new editor.
const wrapping = new Compartment()
const spelling = new Compartment()
const language = new Compartment()
const listening = new Compartment() // the page's change listener
const indenting = new Compartment()

const spellAttrs = (on) => EditorView.contentAttributes.of({ spellcheck: on ? 'true' : 'false' })

// options: { parent, text, name, wrap, spellcheck, indent, onChange(text), onSelection(info), saved }
// Returns a small API used by the editor page and the find bar. The language
// is set separately with setLanguage(), since it loads asynchronously.
// `saved` is a snapshot() of an earlier editor for the same document: it
// brings back its undo history, selection and scroll position.
export function createEditor({ parent, text, name, wrap, spellcheck, indent, onChange, onSelection, saved }) {
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

  const listener = EditorView.updateListener.of((u) => {
    if (u.docChanged) {
      synced = u.state.doc.toString()
      onChange?.(synced)
    }
    if (u.docChanged || u.selectionSet) report(u.state)
  })

  const fresh = () =>
    EditorState.create({
      doc: text,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indenting.of(indentSettings(indent)),
        rectangularSelection(), // Alt+drag: block selection
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        syntaxHighlighting(highlightStyle),
        bracketMatching(),
        keymap.of([
          { key: 'Enter', run: enter },
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
        findMatchesField,
        findHighlighter,
        EditorView.contentAttributes.of({ 'aria-label': 'Document text', autocapitalize: 'off' }),
        listening.of(listener),
      ],
    })

  // A saved state, with this page's listener and current settings.
  const resumed = () =>
    saved.state.update({
      effects: [
        listening.reconfigure(listener),
        wrapping.reconfigure(wrap ? EditorView.lineWrapping : []),
        spelling.reconfigure(spellAttrs(spellcheck)),
        indenting.reconfigure(indentSettings(indent)),
        setFindMatches.of([]),
      ],
    }).state

  const view = new EditorView({ parent, state: saved ? resumed() : fresh() })
  if (saved) {
    // The document may have changed elsewhere since (another tab).
    synced = view.state.doc.toString()
    if (synced !== text) {
      synced = text
      const { from, to } = view.state.selection.main
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: EditorSelection.single(Math.min(from, text.length), Math.min(to, text.length)),
      })
    }
    if (saved.scroll) view.dispatch({ effects: saved.scroll })
  }
  report(view.state)

  const selection = () => view.state.selection.main

  return {
    view,
    // Run one of EDITOR_COMMANDS, then put focus back in the text.
    run(name) {
      const cmd = EDITOR_COMMANDS[name]
      if (!cmd) return false
      view.focus()
      return cmd(view)
    },
    // Everything needed to resume this editor later (see `saved` above).
    snapshot: () => ({ state: view.state, scroll: view.scrollSnapshot() }),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
    hasFocus: () => view.hasFocus,

    setWrap: (on) => view.dispatch({ effects: wrapping.reconfigure(on ? EditorView.lineWrapping : []) }),
    setSpellcheck: (on) => view.dispatch({ effects: spelling.reconfigure(spellAttrs(on)) }),
    // Highlight as `support` (a loaded LanguageSupport, or null for plain
    // text); `name` picks the fallback comment syntax.
    // `smart`: indent new lines by the language's rules.
    setLanguage(n, support, { smart = false } = {}) {
      view.dispatch({ effects: language.reconfigure([commentData(n), support ?? [], smart ? smartEnter.of(true) : []]) })
    },
    setIndent(indent) {
      view.dispatch({ effects: indenting.reconfigure(indentSettings(indent)) })
    },

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
    // Highlight these [start, end] matches (sorted), or none.
    highlight(matches = []) {
      view.dispatch({ effects: setFindMatches.of(matches) })
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
