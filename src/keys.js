// Every keyboard shortcut, in one place: the shortcuts panel lists these, and
// the command palette shows them next to the commands they belong to.
// "Mod" is Ctrl, or Cmd on a Mac.
import { t, translated } from './i18n.js'

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

// Groups of shortcuts, in the order the shortcuts panel lists them, and the
// names it shows for them. Shortcuts refer to a group by its id.
export const SHORTCUT_GROUPS = translated({
  documents: 'shortcuts.groups.documents',
  find: 'shortcuts.groups.find',
  editing: 'shortcuts.groups.editing',
  folding: 'shortcuts.groups.folding',
  cursors: 'shortcuts.groups.cursors',
})

export const SHORTCUTS = [
  // Documents
  { id: 'quickOpen', group: 'documents', keys: ['Mod+P'] },
  { id: 'palette', group: 'documents', keys: ['Mod+Shift+P'] },
  { id: 'save', group: 'documents', keys: ['Mod+S'] },
  { id: 'saveAs', group: 'documents', keys: ['Mod+Shift+S'] },
  { id: 'prevTab', group: 'documents', keys: ['Alt+PageUp'] },
  { id: 'nextTab', group: 'documents', keys: ['Alt+PageDown'] },
  { id: 'shortcuts', group: 'documents', keys: ['F1', '?'] },
  { id: 'searchAll', group: 'documents', keys: ['Mod+Shift+F'] },
  { id: 'saveAll', group: 'documents', keys: ['Mod+Alt+S'] },
  { id: 'settings', group: 'documents', keys: ['Mod+,'] },
  { id: 'split', group: 'documents', keys: ['Mod+\\'] },
  { id: 'sidebar', group: 'documents', keys: ['Mod+Shift+E'] },
  // Find
  { id: 'find', group: 'find', keys: ['Mod+F'] },
  { id: 'replace', group: 'find', keys: ['Mod+H'] },
  { id: 'findNext', group: 'find', keys: ['Enter', 'Shift+Enter'] },
  { id: 'replaceAll', group: 'find', keys: ['Mod+Enter'] },
  { id: 'matchCase', group: 'find', keys: ['Alt+C', 'Alt+W', 'Alt+R'] },
  { id: 'goToLine', group: 'find', keys: ['Mod+G'] },
  // Editing
  { id: 'indent', group: 'editing', keys: ['Tab', 'Shift+Tab'] },
  { id: 'toggleComment', group: 'editing', keys: ['Mod+/'] },
  { id: 'moveLineUp', group: 'editing', keys: ['Alt+↑', 'Alt+↓'] },
  { id: 'copyLineDown', group: 'editing', keys: ['Shift+Alt+↑', 'Shift+Alt+↓'] },
  { id: 'deleteLine', group: 'editing', keys: ['Mod+Shift+K'] },
  { id: 'indentMore', group: 'editing', keys: ['Mod+]', 'Mod+['] },
  { id: 'matchingBracket', group: 'editing', keys: ['Mod+Shift+\\'] },
  { id: 'undo', group: 'editing', keys: ['Mod+Z', isMac ? 'Mod+Shift+Z' : 'Mod+Y'] },
  { id: 'wrap', group: 'editing', keys: ['Alt+Z'] },
  { id: 'bold', group: 'editing', keys: ['Mod+B', 'Mod+I'] },
  { id: 'complete', group: 'editing', keys: ['Ctrl+Space'] },
  { id: 'problems', group: 'editing', keys: ['Mod+Shift+M'] },
  { id: 'nextProblem', group: 'editing', keys: ['F8'] },
  // Folding
  { id: 'fold', group: 'folding', keys: isMac ? ['Mod+Alt+[', 'Mod+Alt+]'] : ['Ctrl+Shift+[', 'Ctrl+Shift+]'] },
  { id: 'foldAll', group: 'folding', keys: ['Ctrl+Alt+[', 'Ctrl+Alt+]'] },
  // Cursors
  { id: 'selectNext', group: 'cursors', keys: ['Mod+D'] },
  { id: 'selectAll', group: 'cursors', keys: ['Mod+Shift+L'] },
  { id: 'addCursor', group: 'cursors', keys: ['Mod+Alt+↑', 'Mod+Alt+↓'] },
  { id: 'clickCursor', group: 'cursors', keys: ['Mod+Click', 'Alt+Drag'] },
  { id: 'selectLine', group: 'cursors', keys: [isMac ? 'Ctrl+L' : 'Alt+L'] },
  { id: 'singleCursor', group: 'cursors', keys: ['Escape'] },
]

// What each shortcut does, in the interface language (shortcuts.labels.<id>).
for (const s of SHORTCUTS) Object.defineProperty(s, 'label', { get: () => t(`shortcuts.labels.${s.id}`), enumerable: true })

const byId = new Map(SHORTCUTS.map((s) => [s.id, s]))
export const shortcut = (id) => byId.get(id)?.keys ?? []

// "Mod+Shift+P" -> "Ctrl+Shift+P", or "⌘⇧P" on a Mac.
const MAC = { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Enter: '↩', Escape: 'Esc', Tab: '⇥' }
export function keyLabel(combo, mac = isMac) {
  const parts = combo.split(/\+(?!$)/) // "Mod++" would be Mod and "+"
  if (!mac) return parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)).join('+')
  return parts.map((p) => MAC[p] ?? p).join('')
}
