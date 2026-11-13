import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SHORTCUTS, keyLabel, shortcut } from '../src/keys.js'

test('key labels: Ctrl on Windows and Linux, symbols on a Mac', () => {
  assert.equal(keyLabel('Mod+Shift+P', false), 'Ctrl+Shift+P')
  assert.equal(keyLabel('Mod+Shift+P', true), '⌘⇧P')
  assert.equal(keyLabel('Alt+PageUp', true), '⌥PageUp')
  assert.equal(keyLabel('Mod+/', false), 'Ctrl+/')
  assert.equal(keyLabel('F1', true), 'F1')
})

test('shortcut ids are unique and every entry has keys', () => {
  const ids = SHORTCUTS.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const s of SHORTCUTS) assert.ok(s.keys.length && s.label && s.group, s.id)
  assert.deepEqual(shortcut('find'), ['Mod+F'])
  assert.deepEqual(shortcut('nope'), [])
})
