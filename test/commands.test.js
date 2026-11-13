import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GROUPS, availableCommands, groupName, registerCommands } from '../src/commands.js'

test('commands come and go with what registered them, and can be conditional', () => {
  let on = false
  const off = registerCommands([
    { id: 'b', title: 'Beta', group: 'Edit', run() {} },
    { id: 'e', title: 'Find', group: 'editor', run() {}, when: () => on },
    { id: 'a', title: 'Alpha', group: 'Edit', run() {} },
    { id: 'c', title: 'Conditional', group: 'App', run() {}, when: () => on },
  ])
  assert.deepEqual(availableCommands().map((c) => c.id), ['a', 'b'])
  on = true
  assert.deepEqual(availableCommands().map((c) => c.id), ['e', 'c', 'a', 'b'], 'Editor first, then others A to Z')
  // Re-registering an id replaces it; the old unregister doesn't remove the new one.
  const off2 = registerCommands([{ id: 'a', title: 'Alpha 2', group: 'Edit', run() {} }])
  off()
  on = false
  assert.deepEqual(availableCommands().map((c) => c.title), ['Alpha 2'])
  off2()
  assert.deepEqual(availableCommands(), [])
})

test('groups are ids; the palette orders them by id and shows their names', () => {
  assert.equal(groupName('editor'), 'Editor')
  assert.equal(groupName('custom'), 'custom', 'an unknown group shows as its id')
  const off = registerCommands([
    { id: 'h', title: 'Help me', group: 'help', run() {} },
    { id: 'f', title: 'Open', group: 'files', run() {} },
    { id: 'd', title: 'Find', group: 'editor', run() {} },
  ])
  assert.deepEqual(availableCommands().map((c) => c.group), ['editor', 'files', 'help'])
  // Renaming a group on screen (as a translation would) doesn't change the order.
  const was = GROUPS.editor
  GROUPS.editor = 'Zzz'
  assert.deepEqual(availableCommands().map((c) => c.group), ['editor', 'files', 'help'])
  GROUPS.editor = was
  off()
})
