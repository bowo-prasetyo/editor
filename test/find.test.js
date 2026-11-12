import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  expandReplacement, findMatches, nextMatchIndex, prevMatchIndex, queryError, replaceAllEdit,
} from '../src/find.js'

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

// --- Regular expressions ---------------------------------------------------

const rx = { regex: true }
const spans = (list) => list.map(([s, e]) => [s, e])

test('regex: patterns, with ^ and $ at every line', () => {
  assert.deepEqual(spans(findMatches('a1 b22 c333', '\\d+', rx)), [[1, 2], [4, 6], [8, 11]])
  assert.deepEqual(spans(findMatches('one\ntwo\nthree', '^t\\w+$', rx)), [[4, 7], [8, 13]])
  assert.deepEqual(spans(findMatches('Cat cat', 'c.t', { ...rx, matchCase: true })), [[4, 7]])
})

test('regex: matches can span lines', () => {
  assert.deepEqual(spans(findMatches('a\nb\nc', 'a\\nb', rx)), [[0, 3]])
})

test('regex: empty matches are found (so "^" can insert at each line)', () => {
  assert.deepEqual(spans(findMatches('ab\ncd', '^', rx)), [[0, 0], [3, 3]])
})

test('regex: whole word wraps alternatives as a group', () => {
  assert.deepEqual(spans(findMatches('cat concat dog', 'cat|dog', { ...rx, wholeWord: true })), [[0, 3], [11, 14]])
})

test('regex: an invalid pattern finds nothing and says why', () => {
  assert.deepEqual(findMatches('abc', '(a', rx), [])
  assert.equal(queryError('(a', rx), 'Invalid pattern')
  assert.equal(queryError('(a', {}), '', 'not a pattern in plain mode')
  assert.equal(queryError('a+', rx), '')
})

test('the match list can be capped', () => {
  assert.equal(findMatches('x'.repeat(50), 'x', {}, 10).length, 10)
})

test('replacement patterns: groups, named groups, whole match, escapes', () => {
  const text = '2024-11-12'
  const [m] = findMatches(text, '(\\d+)-(?<month>\\d+)-(\\d+)', rx)
  const r = (tpl) => expandReplacement(tpl, m, text, true)
  assert.equal(r('$3/$2/$1'), '12/11/2024')
  assert.equal(r('$<month>'), '11')
  assert.equal(r('[$&]'), '[2024-11-12]')
  assert.equal(r('$$1'), '$1')
  assert.equal(r('$10'), '20240', '$10 is $1 then "0" with only 3 groups')
  assert.equal(r('$9 $<nope>'), '$9 ', 'missing groups: numbered stay literal, unknown names are empty')
  assert.equal(r('a\\nb\\tc\\\\d'), 'a\nb\tc\\d')
  assert.equal(expandReplacement('$1\\n', m, text, false), '$1\\n', 'plain mode: used as typed')
})

test('replace all with a regex expands each match', () => {
  const text = 'name: Ann\nname: Bob'
  const edit = replaceAllEdit(text, findMatches(text, '^name: (\\w+)$', rx), '- $1', true)
  assert.equal(text.slice(0, edit.from) + edit.insert + text.slice(edit.to), '- Ann\n- Bob')
  const lines = 'a\nb'
  const bullet = replaceAllEdit(lines, findMatches(lines, '^', rx), '* ', true)
  assert.equal(lines.slice(0, bullet.from) + bullet.insert + lines.slice(bullet.to), '* a\n* b')
})
