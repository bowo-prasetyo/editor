import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EditorSelection, EditorState } from '@codemirror/state'
import {
  copyLineDown, indentLess, moveLineUp, toggleComment,
} from '@codemirror/commands'
import { selectNextOccurrence, selectSelectionMatches } from '@codemirror/search'
import { commentData, editingSetup, goToPosition, indentOrInsert, newlineKeepIndent } from '../src/cm.js'
import { commentTokensFor } from '../src/filetype.js'

// A document as text with "|" marking cursors and "[...]" marking selections.
function make(src, name = 'a.js') {
  const ranges = []
  let text = ''
  let start = null
  for (const ch of src) {
    if (ch === '|') ranges.push(EditorSelection.cursor(text.length))
    else if (ch === '[') start = text.length
    else if (ch === ']') ranges.push(EditorSelection.range(start, text.length))
    else text += ch
  }
  return EditorState.create({
    doc: text,
    selection: EditorSelection.create(ranges.length ? ranges : [EditorSelection.cursor(0)]),
    extensions: [editingSetup(), commentData(name)],
  })
}
function show(state) {
  let out = state.doc.toString()
  for (const r of [...state.selection.ranges].reverse()) {
    out = r.empty ? out.slice(0, r.from) + '|' + out.slice(r.from) : out.slice(0, r.from) + '[' + out.slice(r.from, r.to) + ']' + out.slice(r.to)
  }
  return out
}
function run(cmd, src, name) {
  let state = make(src, name)
  const ok = cmd({ state, dispatch: (tr) => (state = tr.state) })
  return ok === false ? null : show(state)
}

test('Enter keeps the indentation of the line exactly, at every cursor', () => {
  assert.equal(run(newlineKeepIndent, 'if (x) {\n    foo()|'), 'if (x) {\n    foo()\n    |')
  assert.equal(run(newlineKeepIndent, '\t\tdeep|'), '\t\tdeep\n\t\t|', 'tabs stay tabs')
  assert.equal(run(newlineKeepIndent, '  a|\n    b|'), '  a\n  |\n    b\n    |')
  assert.equal(run(newlineKeepIndent, '  |    x'), '  \n  |    x', 'only the indentation before the cursor')
  assert.equal(run(newlineKeepIndent, 'a[bc]d'), 'a\n|d', 'replaces a selection')
})

test('Tab inserts two spaces at each cursor, or indents selected lines; Shift+Tab outdents', () => {
  assert.equal(run(indentOrInsert, 'a|b\nc|d'), 'a  |b\nc  |d')
  assert.equal(run(indentOrInsert, '[one\ntwo]'), '  [one\n  two]')
  assert.equal(run(indentLess, '    [one\n  two]'), '  [one\ntwo]')
})

test('Ctrl/Cmd+/ comments lines in the file type\'s syntax', () => {
  assert.equal(run(toggleComment, '[a\nb]', 'x.js'), '// [a\n// b]')
  assert.equal(run(toggleComment, '// a|', 'x.js'), 'a|')
  assert.equal(run(toggleComment, 'key: 1|', 'c.yaml'), '# key: 1|')
  assert.equal(run(toggleComment, 'SELECT 1|', 'q.sql'), '-- SELECT 1|')
  assert.equal(run(toggleComment, '<p>hi</p>|', 'p.html'), '<!-- <p>hi</p>| -->')
  assert.deepEqual(commentTokensFor('Dockerfile'), { line: '#' })
  assert.deepEqual(commentTokensFor('.gitignore'), { line: '#' })
  assert.deepEqual(commentTokensFor('style.css'), { block: { open: '/*', close: '*/' } })
})

test('lines can be moved and duplicated', () => {
  assert.equal(run(moveLineUp, 'one\ntwo|'), 'two|\none')
  assert.equal(run(copyLineDown, 'one|\ntwo'), 'one\none|\ntwo')
})

test('Ctrl/Cmd+D adds the next occurrence; Ctrl/Cmd+Shift+L selects them all', () => {
  assert.equal(run(selectNextOccurrence, 'foo| bar foo foo'), '[foo] bar foo foo')
  assert.equal(run(selectNextOccurrence, '[foo] bar foo foo'), '[foo] bar [foo] foo')
  assert.equal(run(selectSelectionMatches, '[foo] bar foo foo'), '[foo] bar [foo] [foo]')
})

test('go to line: "42" and "42:7", clamped to the document', () => {
  const doc = make('one\ntwo\nthree').doc
  assert.equal(goToPosition(doc, '2'), 4)
  assert.equal(goToPosition(doc, ' 3:3 '), 10)
  assert.equal(goToPosition(doc, '3:99'), 13)
  assert.equal(goToPosition(doc, '99'), 8)
  assert.equal(goToPosition(doc, '0'), 0)
  assert.equal(goToPosition(doc, 'abc'), null)
  assert.equal(goToPosition(doc, ''), null)
})

test('textDiff finds the smallest single change', async () => {
  const { textDiff } = await import('../src/cm.js')
  assert.equal(textDiff('abc', 'abc'), null)
  assert.deepEqual(textDiff('hello world', 'hello brave world'), { from: 6, to: 6, insert: 'brave ' })
  assert.deepEqual(textDiff('aaa', 'aa'), { from: 2, to: 3, insert: '' })
  assert.deepEqual(textDiff('', 'x'), { from: 0, to: 0, insert: 'x' })
  assert.deepEqual(textDiff('a😀b', 'a😃b'), { from: 1, to: 3, insert: '😃' })
})
