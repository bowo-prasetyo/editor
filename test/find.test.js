import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findMatches, nextMatchIndex, prevMatchIndex, replaceAllEdit } from '../src/find.js'

test('finds all matches, ignoring case by default', () => {
  assert.deepEqual(findMatches('Cat cat CAT', 'cat'), [[0, 3], [4, 7], [8, 11]])
})

test('match case', () => {
  assert.deepEqual(findMatches('Cat cat CAT', 'cat', { matchCase: true }), [[4, 7]])
})

test('whole word, including non-ASCII letters', () => {
  assert.deepEqual(findMatches('cat concat cat_x cat.', 'cat', { wholeWord: true }), [[0, 3], [17, 20]])
  assert.deepEqual(findMatches('kué kuéh kué', 'kué', { wholeWord: true }), [[0, 3], [9, 12]])
})

test('regex characters in the query are literal', () => {
  assert.deepEqual(findMatches('a.b axb (a.b)', '(a.b)'), [[8, 13]])
  assert.deepEqual(findMatches('price $5 or $50', '$5'), [[6, 8], [12, 14]])
})

test('empty query finds nothing', () => {
  assert.deepEqual(findMatches('abc', ''), [])
})

test('next and previous wrap around', () => {
  const m = [[2, 3], [10, 11], [20, 21]]
  assert.equal(nextMatchIndex(m, 0), 0)
  assert.equal(nextMatchIndex(m, 3), 1)
  assert.equal(nextMatchIndex(m, 21), 0)
  assert.equal(prevMatchIndex(m, 10), 0)
  assert.equal(prevMatchIndex(m, 2), 2)
  assert.equal(nextMatchIndex([], 0), -1)
})

test('replace all is one contiguous edit', () => {
  const text = 'one cat, two cats, three'
  const edit = replaceAllEdit(text, findMatches(text, 'cat'), 'dog')
  assert.deepEqual(edit, { from: 4, to: 16, insert: 'dog, two dog', count: 2 })
  assert.equal(text.slice(0, edit.from) + edit.insert + text.slice(edit.to), 'one dog, two dogs, three')
  assert.equal(replaceAllEdit(text, [], 'x'), null)
})
