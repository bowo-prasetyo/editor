import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuzzyMatch, highlightRuns } from '../src/fuzzy.js'

const rank = (query, names) =>
  names
    .map((n) => ({ n, m: fuzzyMatch(query, n, n.lastIndexOf('/') + 1) }))
    .filter((x) => x.m)
    .sort((a, b) => b.m.score - a.m.score)
    .map((x) => x.n)

test('characters must appear in order, ignoring case and spaces', () => {
  assert.ok(fuzzyMatch('rdme', 'README.md'))
  assert.ok(fuzzyMatch('read me', 'README.md'))
  assert.equal(fuzzyMatch('mdr', 'README.md'), null)
  assert.deepEqual(fuzzyMatch('', 'x'), { score: 0, positions: [] })
})

test('better matches rank first', () => {
  // The file name counts more than its folder.
  assert.deepEqual(rank('app', ['Work/mapping.txt', 'app.js', 'Apps/notes.md']), ['app.js', 'Work/mapping.txt', 'Apps/notes.md'])
  assert.deepEqual(rank('sl', ['shopping list.txt', 'slides.md', 'tools.js']), ['slides.md', 'shopping list.txt'])
  assert.deepEqual(rank('wc', ['Work/Clients/acme.md', 'Wildcat.txt']).length, 2)
})

test('word starts are preferred when choosing which characters to highlight', () => {
  const m = fuzzyMatch('sl', 'shopping list.txt')
  assert.deepEqual(m.positions, [0, 9])
  assert.deepEqual(highlightRuns('shopping list', m.positions), [
    { text: 's', hit: true }, { text: 'hopping ', hit: false }, { text: 'l', hit: true }, { text: 'ist', hit: false },
  ])
})

test('accents match however they are encoded, and highlights cover whole letters', () => {
  // macOS stores file names decomposed: "e" followed by a combining accent.
  const nfd = 'Cafe\u0301 notes.md'
  assert.deepEqual(fuzzyMatch('café', nfd).positions, [0, 1, 2, 3, 4])
  assert.deepEqual(fuzzyMatch('cafe\u0301', 'Café.md').positions, [0, 1, 2, 3])
  assert.equal(fuzzyMatch('cafe', 'Café.md'), null, 'accents still matter')
  // "İ" lowercases to two characters; positions still point into the original.
  const m = fuzzyMatch('istanbul', 'İstanbul.txt')
  assert.deepEqual(highlightRuns('İstanbul.txt', m.positions), [{ text: 'İstanbul', hit: true }, { text: '.txt', hit: false }])
  assert.deepEqual(fuzzyMatch('rp', 'résumé plan.md').positions, [0, 7])
})
