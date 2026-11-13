import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countLines, countWords, lineColAt, slowToCount } from '../src/stats.js'

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

test('countWords splits scripts written without spaces into words', () => {
  assert.equal(countWords('日本語のテキストを書きます'), 6, 'Japanese')
  assert.equal(countWords('ภาษาไทยไม่มีช่องว่าง'), 5, 'Thai')
  assert.equal(countWords('Hello 世界です world!'), 4, 'mixed with spaced words')
  assert.equal(countWords('한국어 문장 입니다'), 3, 'Korean puts spaces between words')
  assert.equal(countWords('。'), 1, 'punctuation alone still counts, as elsewhere')
})

test('slowToCount: big texts, and long ones in scripts without spaces', () => {
  assert.equal(slowToCount('word '.repeat(10_000)), false)
  assert.equal(slowToCount('w'.repeat(200_000)), true)
  assert.equal(slowToCount('日本語'.repeat(10_000)), true)
  assert.equal(slowToCount('日本語'.repeat(100)), false)
})
