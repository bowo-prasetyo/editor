import { test } from 'node:test'
import assert from 'node:assert/strict'
import { convertIndentation, defaultIndent, detectIndent, effectiveIndent } from '../src/indentation.js'

test('defaults by file type', () => {
  assert.deepEqual(defaultIndent('app.js'), { type: 'spaces', size: 2 })
  assert.deepEqual(defaultIndent('tool.py'), { type: 'spaces', size: 4 })
  assert.deepEqual(defaultIndent('main.go'), { type: 'tabs', size: 4 })
  assert.deepEqual(defaultIndent('Makefile'), { type: 'tabs', size: 4 })
})

test('detects tabs, 2 spaces and 4 spaces', () => {
  assert.deepEqual(detectIndent('func f() {\n\tif x {\n\t\treturn\n\t}\n}'), { type: 'tabs', size: null })
  assert.deepEqual(detectIndent('a:\n  b:\n    c: 1\n  d: 2\n'), { type: 'spaces', size: 2 })
  assert.deepEqual(detectIndent('def f():\n    if x:\n        return 1\n    return 2\n'), { type: 'spaces', size: 4 })
})

test('detection ignores block-comment stars, blank lines and alignment noise', () => {
  const js = '/**\n * doc\n */\nfunction f() {\n  if (a) {\n    b()\n  }\n}\n'
  assert.deepEqual(detectIndent(js), { type: 'spaces', size: 2 })
  assert.equal(detectIndent('no indentation\nat all\n'), null)
  assert.equal(detectIndent('one\n  line'), null, 'too little to tell')
})

test('a document\'s own choice wins; otherwise detected; otherwise the default', () => {
  assert.deepEqual(effectiveIndent({ name: 'a.js', content: 'x', indent: { type: 'tabs', size: 8 } }), { type: 'tabs', size: 8, auto: false })
  assert.deepEqual(effectiveIndent({ name: 'a.js', content: 'if:\n    a\n    b\n' }), { type: 'spaces', size: 4, auto: true })
  assert.deepEqual(effectiveIndent({ name: 'a.go', content: 'x\n\ty\n\tz' }), { type: 'tabs', size: 4, auto: true })
  assert.deepEqual(effectiveIndent({ name: 'a.py', content: '' }), { type: 'spaces', size: 4, auto: true })
})

test('converting between tabs and spaces keeps the structure', () => {
  const four = 'a\n    b\n        c\n      d\n'
  assert.equal(convertIndentation(four, { type: 'spaces', size: 4 }, { type: 'tabs', size: 4 }), 'a\n\tb\n\t\tc\n\t  d\n')
  assert.equal(convertIndentation(four, { type: 'spaces', size: 4 }, { type: 'spaces', size: 2 }), 'a\n  b\n    c\n    d\n')
  assert.equal(convertIndentation('\tx\n\t\ty', { type: 'tabs', size: 4 }, { type: 'spaces', size: 2 }), '  x\n    y')
  assert.equal(convertIndentation('  \tx', { type: 'tabs', size: 4 }, { type: 'spaces', size: 4 }), '    x', 'mixed: a tab after 2 spaces reaches column 4')
  assert.equal(convertIndentation('a  b\n', { type: 'spaces', size: 2 }, { type: 'tabs', size: 2 }), 'a  b\n', 'only leading whitespace')
})
