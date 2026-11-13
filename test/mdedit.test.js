// Markdown writing helpers (src/mdedit.js): bold and italic.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EditorSelection, EditorState } from '@codemirror/state'
import { toggleBold, toggleItalic } from '../src/mdedit.js'

// Text with "|" for a cursor and "[...]" for a selection; run `cmd`; return
// the result in the same notation.
function run(cmd, src) {
  const ranges = []
  let text = ''
  let start = null
  for (const ch of src) {
    if (ch === '|') ranges.push(EditorSelection.cursor(text.length))
    else if (ch === '[') start = text.length
    else if (ch === ']') ranges.push(EditorSelection.range(start, text.length))
    else text += ch
  }
  let state = EditorState.create({
    doc: text,
    selection: EditorSelection.create(ranges),
    extensions: [EditorState.allowMultipleSelections.of(true)],
  })
  const view = { get state() { return state }, dispatch: (tr) => (state = tr.state) }
  assert.equal(cmd(view), true)
  let out = state.doc.toString()
  for (const r of [...state.selection.ranges].reverse()) {
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
