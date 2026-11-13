import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availableCommands, registerCommands } from '../src/commands.js'

test('commands come and go with what registered them, and can be conditional', () => {
  let on = false
  const off = registerCommands([
    { id: 'b', title: 'Beta', group: 'Edit', run() {} },
    { id: 'e', title: 'Find', group: 'Editor', run() {}, when: () => on },
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
