import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EditorSelection, EditorState, Text } from '@codemirror/state'
import {
  finalNewlineChange,
  joinLines,
  lineBlocks,
  lowerCase,
  removeDuplicateLines,
  reverseLines,
  sortLinesAscending,
  sortLinesBy,
  sortLinesDescending,
  sortLinesIgnoreCase,
  titleCase,
  toTitleCase,
  trailingWhitespaceChanges,
  trimTrailingWhitespace,
  upperCase,
  whitespaceFix,
} from '../src/textops.js'
import { indentGuideRanges } from '../src/cm.js'

// Run a command on text where "|" marks cursors and "[...]" selections.
function run(cmd, input) {
  const ranges = []
  let text = ''
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (c === '|') ranges.push(EditorSelection.cursor(text.length))
    else if (c === '[') ranges.push({ from: text.length })
    else if (c === ']') {
      const r = ranges.pop()
      ranges.push(EditorSelection.range(r.from, text.length))
    } else text += c
  }
  let state = EditorState.create({
    doc: text,
    selection: EditorSelection.create(ranges.length ? ranges : [EditorSelection.cursor(0)]),
    extensions: EditorState.allowMultipleSelections.of(true),
  })
  const ok = cmd({ state, dispatch: (tr) => (state = tr.state) })
  return { ok, text: state.doc.toString(), state }
}

test('sorting is natural (2 before 10), stable on case, and can ignore case', () => {
  assert.deepEqual(sortLinesBy(['file10', 'file2', 'file1']), ['file1', 'file2', 'file10'])
  assert.deepEqual(sortLinesBy(['b', 'a', 'c'], { descending: true }), ['c', 'b', 'a'])
  assert.deepEqual(sortLinesBy(['b', 'B', 'a'], { ignoreCase: true }), ['a', 'b', 'B'])
})

test('sort works on the whole document with nothing selected', () => {
  assert.equal(run(sortLinesAscending, 'c\na|\nb').text, 'a\nb\nc')
  assert.equal(run(sortLinesDescending, '|a\nc\nb').text, 'c\nb\na')
  assert.equal(run(sortLinesIgnoreCase, '|b\nA\nc').text, 'A\nb\nc')
})

test('sort works on just the selected lines; a selection ending at a line start excludes that line', () => {
  assert.equal(run(sortLinesAscending, 'z\n[c\nb\n]a').text, 'z\nb\nc\na')
  assert.equal(run(sortLinesAscending, 'z\nc[c\nb]b\na').text, 'z\nbb\ncc\na')
})

test('sorting lines that are already sorted changes nothing', () => {
  assert.equal(run(sortLinesAscending, '|a\nb').ok, false)
})

test('line blocks merge touching selections', () => {
  const { state } = run(() => false, '[a\nb]\n[c]\nd\n[e]')
  assert.deepEqual(lineBlocks(state), [{ from: 1, to: 3 }, { from: 5, to: 5 }])
})

test('remove duplicates keeps the first of each; reverse flips the order', () => {
  assert.equal(run(removeDuplicateLines, '|a\nb\na\nc\nb').text, 'a\nb\nc')
  assert.equal(run(reverseLines, '|1\n2\n3').text, '3\n2\n1')
})

test('join lines: a cursor joins its line with the next, dropping indentation', () => {
  const r = run(joinLines, 'if (x) {|  \n    foo()\n}')
  assert.equal(r.text, 'if (x) { foo()\n}')
  assert.equal(r.state.selection.main.head, 'if (x) { '.length)
})

test('join lines: a selection joins every line it covers; blank lines join without a space', () => {
  assert.equal(run(joinLines, '[a\nb\n\nc]\nd').text, 'a b c\nd')
  assert.equal(run(joinLines, 'only|').ok, false)
})

test('change case: the selection, or the word at the cursor', () => {
  assert.equal(run(upperCase, 'say [hello] world').text, 'say HELLO world')
  assert.equal(run(lowerCase, 'SAY HE|LLO').text, 'SAY hello')
  assert.equal(run(titleCase, '[the QUICK brown fox\'s tail]').text, "The Quick Brown Fox's Tail")
  assert.equal(toTitleCase('élan vital-force'), 'Élan Vital-Force')
})

test('change case keeps the selection on text whose length changes', () => {
  const r = run(upperCase, '[straße]')
  assert.equal(r.text, 'STRASSE')
  assert.deepEqual([r.state.selection.main.from, r.state.selection.main.to], [0, 7])
})

test('trailing whitespace: spaces and tabs at line ends go, nothing else', () => {
  const doc = Text.of(['a  ', '\tb\t', '', '  ', 'c'])
  assert.deepEqual(trailingWhitespaceChanges(doc), [
    { from: 1, to: 3 },
    { from: 6, to: 7 },
    { from: 9, to: 11 },
  ])
  assert.equal(run(trimTrailingWhitespace, '|a  \n\tb\t\n  \nc').text, 'a\n\tb\n\nc')
})

test('final newline: added once, never to an empty document', () => {
  assert.deepEqual(finalNewlineChange(Text.of(['a'])), { from: 1, insert: '\n' })
  assert.equal(finalNewlineChange(Text.of(['a', ''])), null)
  assert.equal(finalNewlineChange(Text.of([''])), null)
  assert.equal(run(whitespaceFix({ trim: true, finalNewline: true }), '|a  \nb ').text, 'a\nb\n')
  assert.equal(run(whitespaceFix({ finalNewline: true }), '|a\n').ok, false)
})

test('indentation guides cover the leading whitespace of lines indented at least one level', () => {
  const doc = Text.of(['a', '  b', ' c', '\td', '    ', '    e'])
  assert.deepEqual(indentGuideRanges(doc, 0, doc.length, 2), [
    [2, 4], // "  b"
    [9, 10], // "\td": a tab is a full level
    [17, 21], // "    e" (the blank "    " line gets none)
  ])
})

test('document words are offered without a type, so the language’s own suggestion wins', async () => {
  const { documentWords } = await import('../src/cm.js')
  const { CompletionContext } = await import('@codemirror/autocomplete')
  const state = EditorState.create({ doc: 'function hello() {}\nhel' })
  const result = documentWords(new CompletionContext(state, state.doc.length, true))
  assert.ok(result.options.some((o) => o.label === 'hello'))
  assert.ok(result.options.every((o) => Object.keys(o).join() === 'label'))
})
