import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extension, isProse, viewSettings } from '../src/filetype.js'

test('extension', () => {
  assert.equal(extension('Notes.TXT'), 'txt')
  assert.equal(extension('README'), '')
  assert.equal(extension('.bashrc'), '')
  assert.equal(extension('a/b.c/file.js'), 'js')
})

test('prose files wrap and spell-check by default; code does not', () => {
  for (const n of ['notes.txt', 'README.md', 'letter', 'Untitled.txt']) assert.equal(isProse(n), true, n)
  for (const n of ['app.js', 'style.css', 'data.json']) assert.equal(isProse(n), false, n)
  assert.deepEqual(viewSettings({ name: 'a.md' }), { wrap: true, spellcheck: true })
  assert.deepEqual(viewSettings({ name: 'a.py' }), { wrap: false, spellcheck: false })
})

test('a document\'s own choice overrides the default', () => {
  assert.deepEqual(viewSettings({ name: 'a.md', wrap: false }), { wrap: false, spellcheck: true })
  assert.deepEqual(viewSettings({ name: 'a.py', spellcheck: true }), { wrap: false, spellcheck: true })
})
