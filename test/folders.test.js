import { test } from 'node:test'
import assert from 'node:assert/strict'
import { labelsOf, normalizeFolder, sortDocs } from '../src/folders.js'

test('folder paths are normalized', () => {
  assert.equal(normalizeFolder('  /Work//Clients/ '), 'Work/Clients')
  assert.equal(normalizeFolder(' My   notes '), 'My notes')
  assert.equal(normalizeFolder('/'), '')
})

test('labels in use, with counts, in natural order', () => {
  const docs = [{ folder: 'Work/Clients' }, { folder: 'ideas' }, {}, { folder: 'Work/Clients' }, { folder: 'Item 10' }, { folder: 'Item 9' }]
  assert.deepEqual(labelsOf(docs), [
    { label: 'ideas', count: 1 },
    { label: 'Item 9', count: 1 },
    { label: 'Item 10', count: 1 },
    { label: 'Work/Clients', count: 2 },
  ])
  assert.deepEqual(labelsOf([{}, {}]), [])
})

test('sorting by edit time, name (natural), creation and size', () => {
  const docs = [
    { name: 'note 10.txt', updatedAt: 3, createdAt: 1, content: 'aaaa' },
    { name: 'Note 9.txt', updatedAt: 1, createdAt: 3, content: 'a' },
    { name: 'apple.md', updatedAt: 2, content: 'aa' }, // no createdAt: uses updatedAt
  ]
  const names = (key) => sortDocs(docs, key).map((d) => d.name)
  assert.deepEqual(names('updated'), ['note 10.txt', 'apple.md', 'Note 9.txt'])
  assert.deepEqual(names('name'), ['apple.md', 'Note 9.txt', 'note 10.txt'])
  assert.deepEqual(names('created'), ['Note 9.txt', 'apple.md', 'note 10.txt'])
  assert.deepEqual(names('size'), ['note 10.txt', 'apple.md', 'Note 9.txt'])
})

test('pinned drafts come first, in the chosen order among themselves', () => {
  const docs = [
    { name: 'a', updatedAt: 4, content: '' },
    { name: 'b', updatedAt: 3, content: '', pinned: true },
    { name: 'c', updatedAt: 2, content: '' },
    { name: 'd', updatedAt: 1, content: '', pinned: true },
  ]
  assert.deepEqual(sortDocs(docs, 'updated').map((d) => d.name), ['b', 'd', 'a', 'c'])
  assert.deepEqual(sortDocs(docs, 'name').map((d) => d.name), ['b', 'd', 'a', 'c'])
})
