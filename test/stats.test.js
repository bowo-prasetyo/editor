import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countLines, countWords, lineColAt } from '../src/stats.js'

test('countLines matches split', () => {
  for (const t of ['', 'a', 'a\n', '\n\n', 'a\nb\nc', '\r\n\r\n'])
    assert.equal(countLines(t), t.split('\n').length, JSON.stringify(t))
})

test('countWords matches the \\S+ regex, including Unicode spaces', () => {
  for (const t of ['', '   ', 'one', ' one  two\tthree\nfour ', 'a b', 'x　y z', 'café naïve', '日本語 テキスト'])
    assert.equal(countWords(t), (t.match(/\S+/g) || []).length, JSON.stringify(t))
})

test('lineColAt gives 1-based line and column', () => {
  const t = 'ab\ncd\n\nef'
  assert.deepEqual(lineColAt(t, 0), { line: 1, col: 1 })
  assert.deepEqual(lineColAt(t, 2), { line: 1, col: 3 })
  assert.deepEqual(lineColAt(t, 3), { line: 2, col: 1 })
  assert.deepEqual(lineColAt(t, 6), { line: 3, col: 1 })
  assert.deepEqual(lineColAt(t, t.length), { line: 4, col: 3 })
})
