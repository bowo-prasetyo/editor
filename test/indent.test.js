import { test } from 'node:test'
import assert from 'node:assert/strict'
import { indentEdit, outdentEdit } from '../src/indent.js'

// Apply an edit the way the editor does and return the result with the
// selection marked as [ ].
function run(fn, marked) {
  const start = marked.indexOf('[')
  const end = marked.indexOf(']') - 1
  const value = marked.replace('[', '').replace(']', '')
  const e = fn(value, start, end)
  if (!e) return null
  const out = value.slice(0, e.from) + e.insert + value.slice(e.to)
  return out.slice(0, e.selStart) + '[' + out.slice(e.selStart, e.selEnd) + ']' + out.slice(e.selEnd)
}

test('Tab with no selection inserts an indent at the caret', () => {
  assert.equal(run(indentEdit, 'ab[]c'), 'ab  []c')
})

test('Tab with a selection indents lines instead of deleting the text', () => {
  assert.equal(run(indentEdit, '[one\ntwo\nthree]'), '[  one\n  two\n  three]')
})

test('Tab with a partial selection indents whole touched lines and keeps the selection', () => {
  assert.equal(run(indentEdit, 'o[ne\ntw]o\nthree'), '  o[ne\n  tw]o\nthree')
})

test('Tab skips empty lines and ignores a trailing line the selection only touches at column 0', () => {
  assert.equal(run(indentEdit, '[a\n\nb\n]c'), '[  a\n\n  b\n]c')
})

test('Shift+Tab removes up to one indent level or one tab', () => {
  assert.equal(run(outdentEdit, '[    a\n b\n\tc\nd]'), '[  a\nb\nc\nd]')
})

test('Shift+Tab with a caret outdents its line and keeps the caret in place', () => {
  assert.equal(run(outdentEdit, '  ab[]c'), 'ab[]c')
  assert.equal(run(outdentEdit, ' []abc'), '[]abc')
})

test('Shift+Tab with nothing to remove is a no-op', () => {
  assert.equal(run(outdentEdit, 'a[b]c'), null)
})
