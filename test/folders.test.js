import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NONE, folderTree, inFolder, normalizeFolder, parentFolder, renamedFolder, sortDocs } from '../src/folders.js'

test('folder paths are tidied', () => {
  assert.equal(normalizeFolder('  /Work//Clients/ '), 'Work/Clients')
  assert.equal(normalizeFolder(' My   notes '), 'My notes')
  assert.equal(normalizeFolder('/'), '')
  assert.equal(parentFolder('a/b/c'), 'a/b')
  assert.equal(parentFolder('a'), '')
})

test('a folder includes its subfolders; NONE means no folder', () => {
  const d = (folder) => ({ folder })
  assert.equal(inFolder(d('Work'), 'Work'), true)
  assert.equal(inFolder(d('Work/Clients'), 'Work'), true)
  assert.equal(inFolder(d('Workshop'), 'Work'), false, 'not a prefix match')
  assert.equal(inFolder(d(undefined), NONE), true)
  assert.equal(inFolder(d('Work'), NONE), false)
  assert.equal(inFolder(d('Work'), ''), true)
})

test('the tree lists parents before children, with counts that include subfolders', () => {
  const docs = [{ folder: 'Work/Clients' }, { folder: 'Work' }, { folder: 'home' }, {}, { folder: 'Work/Clients' }]
  assert.deepEqual(folderTree(docs, ['Ideas', 'Work/Archive']), [
    { path: 'home', name: 'home', depth: 0, count: 1 },
    { path: 'Ideas', name: 'Ideas', depth: 0, count: 0 },
    { path: 'Work', name: 'Work', depth: 0, count: 3 },
    { path: 'Work/Archive', name: 'Archive', depth: 1, count: 0 },
    { path: 'Work/Clients', name: 'Clients', depth: 1, count: 2 },
  ])
})

test('renaming or removing a folder moves its documents and subfolders along', () => {
  assert.equal(renamedFolder('Work', 'Work', 'Job'), 'Job')
  assert.equal(renamedFolder('Work/Clients', 'Work', 'Job'), 'Job/Clients')
  assert.equal(renamedFolder('Workshop', 'Work', 'Job'), undefined)
  assert.equal(renamedFolder('Work/Clients', 'Work/Clients', ''), '', 'removed: back to no folder')
  assert.equal(renamedFolder('Work/Clients/2024', 'Work/Clients', 'Work'), 'Work/2024')
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
