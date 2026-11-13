// Markdown writing helpers (src/mdedit.js): bold and italic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EditorSelection, EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { continueList, headings, toggleBold, toggleItalic } from '../src/mdedit.js'

// Text with "|" for a cursor and "[...]" for a selection; run `cmd`; return
// the result in the same notation.
// (`brackets: false` reads "[" and "]" as text, for Markdown task boxes.)
function run(cmd, src, { md = false, expect = true, brackets = true } = {}) {
  const ranges = []
  let text = ''
  let start = null
  for (const ch of src) {
    if (ch === '|') ranges.push(EditorSelection.cursor(text.length))
    else if (brackets && ch === '[') start = text.length
    else if (brackets && ch === ']') ranges.push(EditorSelection.range(start, text.length))
    else text += ch
  }
  let state = EditorState.create({
    doc: text,
    selection: EditorSelection.create(ranges),
    extensions: [EditorState.allowMultipleSelections.of(true), md ? markdown() : []],
  })
  if (md) ensureSyntaxTree(state, state.doc.length, 1000)
  const view = { get state() { return state }, dispatch: (tr) => (state = tr.state) }
  assert.equal(cmd(view), expect)
  let out = state.doc.toString()
  for (const r of [...state.selection.ranges].reverse()) {
    if (!brackets && !r.empty) throw new Error('selection in bracket-free notation')
    out = r.empty ? out.slice(0, r.from) + '|' + out.slice(r.from) : out.slice(0, r.from) + '[' + out.slice(r.from, r.to) + ']' + out.slice(r.to)
  }
  return out
}

test('bold wraps the selection, and unwraps it again', () => {
  assert.equal(run(toggleBold, 'a [word] b'), 'a **[word]** b')
  assert.equal(run(toggleBold, 'a **[word]** b'), 'a [word] b', 'wrapped just outside the selection')
  assert.equal(run(toggleBold, 'a [**word**] b'), 'a [word] b', 'wrapped inside it')
})

test('italic wraps and unwraps with single stars', () => {
  assert.equal(run(toggleItalic, 'a [word] b'), 'a *[word]* b')
  assert.equal(run(toggleItalic, 'a *[word]* b'), 'a [word] b')
  assert.equal(run(toggleItalic, 'a [*word*] b'), 'a [word] b')
})

test('bold and italic don’t take each other’s stars', () => {
  assert.equal(run(toggleItalic, 'a **[word]** b'), 'a ***[word]*** b', 'italic on bold: both')
  assert.equal(run(toggleBold, 'a *[word]* b'), 'a ***[word]*** b', 'bold on italic: both')
  assert.equal(run(toggleItalic, 'a ***[word]*** b'), 'a **[word]** b', 'bold stays')
  assert.equal(run(toggleBold, 'a ***[word]*** b'), 'a *[word]* b', 'italic stays')
})

test('with nothing selected, the pair goes in with the cursor between; an empty pair comes out', () => {
  assert.equal(run(toggleBold, 'a | b'), 'a **|** b')
  assert.equal(run(toggleBold, 'a **|** b'), 'a | b')
  assert.equal(run(toggleItalic, 'a | b'), 'a *|* b')
  assert.equal(run(toggleItalic, 'a *|* b'), 'a | b')
})

test('every selection is toggled, and nothing else changes', () => {
  assert.equal(run(toggleBold, '[one] two [three]\nuntouched'), '**[one]** two **[three]**\nuntouched')
})

// --- Lists continue on Enter ---------------------------------------------------------

const enter = (src, opts) => run(continueList, src, { md: true, brackets: false, ...opts })

test('Enter continues bullet, numbered, task and quote lines, copying indentation and spacing', () => {
  assert.equal(enter('- one|'), '- one\n- |')
  assert.equal(enter('  * one|'), '  * one\n  * |')
  assert.equal(enter('+   wide|'), '+   wide\n+   |')
  assert.equal(enter('9. nine|'), '9. nine\n10. |')
  assert.equal(enter('3) three|'), '3) three\n4) |')
  assert.equal(enter('- [x] done|'), '- [x] done\n- [ ] |', 'a new task is unchecked')
  assert.equal(enter('- [ ] todo|'), '- [ ] todo\n- [ ] |')
  assert.equal(enter('> quoted|'), '> quoted\n> |')
  assert.equal(enter('> > nested|'), '> > nested\n> > |')
})

test('Enter in the middle of an item carries the rest to the new one', () => {
  assert.equal(enter('- one| two'), '- one\n- | two')
})

test('an ordered list isn’t renumbered: only the new line is written', () => {
  assert.equal(enter('1. a|\n2. b\n3. c'), '1. a\n2. |\n2. b\n3. c')
})

test('Enter on an empty item ends the list', () => {
  assert.equal(enter('- one\n- |'), '- one\n|')
  assert.equal(enter('1. one\n2. |'), '1. one\n|')
  assert.equal(enter('- [ ] |'), '|')
  assert.equal(enter('> |'), '|')
})

test('Enter does its usual thing outside lists, in the marker, and in code blocks', () => {
  assert.equal(enter('plain text|', { expect: false }), 'plain text|')
  assert.equal(enter('-| one', { expect: false }), '-| one', 'cursor inside the marker')
  assert.equal(enter('```\n- not a list|\n```', { expect: false }), '```\n- not a list|\n```')
  assert.equal(run(continueList, '- [some] text', { md: true, expect: false }), '- [some] text', 'a selection')
})

test('every cursor continues its own list; other lines are untouched', () => {
  assert.equal(enter('- a|\nkeep\n1. b|'), '- a\n- |\nkeep\n1. b\n2. |')
})

// --- Headings ------------------------------------------------------------------------

test('headings: levels and text, skipping code blocks; underlined headings too', () => {
  const state = EditorState.create({
    doc: '# Title\n\ntext\n\n## Part one ##\n\n```\n# not a heading\n```\n\nSetext\n------\n\n### Deep',
    extensions: [markdown()],
  })
  assert.deepEqual(
    headings(state).map(({ level, text }) => [level, text]),
    [[1, 'Title'], [2, 'Part one'], [2, 'Setext'], [3, 'Deep']],
  )
  assert.equal(headings(state)[1].from, state.doc.toString().indexOf('## Part one'))
})
