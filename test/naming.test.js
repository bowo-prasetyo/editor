import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nameFromContent, displayName } from '../src/naming.js'

test('names a document after its first non-empty line', () => {
  assert.equal(nameFromContent('\n  Shopping list  \nmilk'), 'Shopping list.txt')
  assert.equal(nameFromContent('# Trip to Bali', 'md'), 'Trip to Bali.md')
  assert.equal(nameFromContent('- buy: eggs/milk?'), 'buy eggsmilk.txt')
  assert.equal(nameFromContent('Ends with a period.'), 'Ends with a period.txt')
  assert.equal(nameFromContent(''), 'Untitled.txt')
  assert.equal(nameFromContent('   \n\n'), 'Untitled.txt')
})

test('long first lines are cut at a word boundary', () => {
  const name = nameFromContent('This is a rather long first line that keeps going and going')
  assert.equal(name, 'This is a rather long first line that.txt')
})

test('empty names display as (untitled)', () => {
  assert.equal(displayName(''), '(untitled)')
  assert.equal(displayName('  '), '(untitled)')
  assert.equal(displayName('a.txt'), 'a.txt')
})
