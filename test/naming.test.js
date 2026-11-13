import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nameFromContent, displayName } from '../src/naming.js'

test('names a document after its first non-empty line (Markdown by default)', () => {
  assert.equal(nameFromContent('\n  Shopping list  \nmilk'), 'Shopping list.md')
  assert.equal(nameFromContent('# Trip to Bali'), 'Trip to Bali.md')
  assert.equal(nameFromContent('- buy: eggs/milk?'), 'buy eggsmilk.md')
  assert.equal(nameFromContent('Ends with a period.'), 'Ends with a period.md')
  assert.equal(nameFromContent('Plain', 'txt'), 'Plain.txt', 'a draft renamed to .txt stays plain text')
  assert.equal(nameFromContent(''), 'Untitled.md')
  assert.equal(nameFromContent('   \n\n'), 'Untitled.md')
})

test('long first lines are cut at a word boundary', () => {
  const name = nameFromContent('This is a rather long first line that keeps going and going')
  assert.equal(name, 'This is a rather long first line that.md')
})

test('empty names display as (untitled)', () => {
  assert.equal(displayName(''), '(untitled)')
  assert.equal(displayName('  '), '(untitled)')
  assert.equal(displayName('a.txt'), 'a.txt')
})
