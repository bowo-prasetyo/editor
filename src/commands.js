// Commands for the command palette. Parts of the app register theirs while
// they're on screen (the editor's commands only while a document is open):
//   { id, title, group: id in GROUPS, shortcut?: id in keys.js, run(), when?() }
import { reactive, shallowReactive } from 'vue'
import { collator } from './locale.js'

// Shallow: commands are stored as given, so unregistering can compare them.
const registry = shallowReactive(new Map())

// Register commands; returns a function that unregisters them.
export function registerCommands(list) {
  for (const c of list) registry.set(c.id, c)
  return () => {
    for (const c of list) if (registry.get(c.id) === c) registry.delete(c.id)
  }
}

// Groups, in the order the palette lists them, and the names it shows for
// them. Commands refer to a group by its id, never by the name on screen.
// Groups not listed here follow, A to Z.
export const GROUPS = {
  editor: 'Editor',
  editing: 'Editing',
  files: 'Files',
  documents: 'Documents',
  settings: 'Settings',
  help: 'Help',
}
const GROUP_ORDER = Object.keys(GROUPS)
const groupRank = (g) => {
  const i = GROUP_ORDER.indexOf(g)
  return i === -1 ? GROUP_ORDER.length : i
}

// The name shown for a group.
export const groupName = (id) => GROUPS[id] ?? id

// The commands available right now, by group then title.
export function availableCommands() {
  return [...registry.values()]
    .filter((c) => !c.when || c.when())
    .sort((a, b) => {
      const { compare } = collator()
      return groupRank(a.group) - groupRank(b.group) || compare(groupName(a.group), groupName(b.group)) || compare(a.title, b.title)
    })
}

// selectedText(): the editor's selection, when a document is open (for
// starting a search with it).
// headings / goTo: the open Markdown document's headings, and jumping to one
// (set by the editor; see the quick switcher's "#").
export const ui = reactive({ shortcutsOpen: false, selectedText: null, headings: null, goTo: null })
