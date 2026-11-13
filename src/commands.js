// Commands for the command palette. Parts of the app register theirs while
// they're on screen (the editor's commands only while a document is open):
//   { id, title, group, shortcut?: id in keys.js, run(), when?() }
import { reactive, shallowReactive } from 'vue'

// Shallow: commands are stored as given, so unregistering can compare them.
const registry = shallowReactive(new Map())

// Register commands; returns a function that unregisters them.
export function registerCommands(list) {
  for (const c of list) registry.set(c.id, c)
  return () => {
    for (const c of list) if (registry.get(c.id) === c) registry.delete(c.id)
  }
}

// Groups in the order the palette lists them; others follow, A to Z.
const GROUP_ORDER = ['Editor', 'Editing', 'Files', 'Documents', 'Settings', 'Help']
const groupRank = (g) => {
  const i = GROUP_ORDER.indexOf(g)
  return i === -1 ? GROUP_ORDER.length : i
}

// The commands available right now, by group then title.
export function availableCommands() {
  return [...registry.values()]
    .filter((c) => !c.when || c.when())
    .sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.group.localeCompare(b.group) || a.title.localeCompare(b.title))
}

// selectedText(): the editor's selection, when a document is open (for
// starting a search with it).
export const ui = reactive({ shortcutsOpen: false, selectedText: null })
