import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cycleTab, neighborTab, touched, withTab, withoutTab } from '../src/tabs.js'

test('tabs open once, after the current one, and old ones make room', () => {
  assert.deepEqual(withTab(['a', 'b'], 'c'), ['a', 'b', 'c'])
  assert.deepEqual(withTab(['a', 'b'], 'c', 'a'), ['a', 'c', 'b'])
  assert.deepEqual(withTab(['a', 'b'], 'a'), ['a', 'b'])
  assert.deepEqual(withTab(['a', 'b', 'c'], 'd', null, 3), ['b', 'c', 'd'])
  assert.deepEqual(withoutTab(['a', 'b'], 'a'), ['b'])
})

test('closing a tab shows its right neighbour, else its left; cycling wraps', () => {
  assert.equal(neighborTab(['a', 'b', 'c'], 'b'), 'c')
  assert.equal(neighborTab(['a', 'b', 'c'], 'c'), 'b')
  assert.equal(neighborTab(['a'], 'a'), null)
  assert.equal(cycleTab(['a', 'b', 'c'], 'c', 1), 'a')
  assert.equal(cycleTab(['a', 'b', 'c'], 'a', -1), 'c')
})

test('recent documents: most recent first, no duplicates, capped', () => {
  assert.deepEqual(touched(['b', 'a', 'c'], 'a'), ['a', 'b', 'c'])
  assert.deepEqual(touched(['a', 'b'], 'c', 2), ['c', 'a'])
})
