// Every keyboard shortcut, in one place: the shortcuts panel lists these, and
// the command palette shows them next to the commands they belong to.
// "Mod" is Ctrl, or Cmd on a Mac.

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

// Groups of shortcuts, in the order the shortcuts panel lists them, and the
// names it shows for them. Shortcuts refer to a group by its id.
export const SHORTCUT_GROUPS = {
  documents: 'Documents',
  find: 'Find',
  editing: 'Editing',
  folding: 'Folding',
  cursors: 'Cursors and selection',
}

export const SHORTCUTS = [
  // Documents
  { id: 'quickOpen', group: 'documents', label: 'Go to a document (quick switcher; type > for commands, # for headings)', keys: ['Mod+P'] },
  { id: 'palette', group: 'documents', label: 'Run a command (command palette)', keys: ['Mod+Shift+P'] },
  { id: 'save', group: 'documents', label: 'Save (to the file, or download)', keys: ['Mod+S'] },
  { id: 'saveAs', group: 'documents', label: 'Save as…', keys: ['Mod+Shift+S'] },
  { id: 'prevTab', group: 'documents', label: 'Previous tab', keys: ['Alt+PageUp'] },
  { id: 'nextTab', group: 'documents', label: 'Next tab', keys: ['Alt+PageDown'] },
  { id: 'shortcuts', group: 'documents', label: 'Show keyboard shortcuts', keys: ['F1', '?'] },
  { id: 'searchAll', group: 'documents', label: 'Search (and replace) in all documents and folders', keys: ['Mod+Shift+F'] },
  { id: 'saveAll', group: 'documents', label: 'Save all changed files', keys: ['Mod+Alt+S'] },
  { id: 'settings', group: 'documents', label: 'Settings', keys: ['Mod+,'] },
  { id: 'split', group: 'documents', label: 'Split the editor / close the split', keys: ['Mod+\\'] },
  { id: 'sidebar', group: 'documents', label: 'Show / hide the folder sidebar (also the Folders button)', keys: ['Mod+Shift+E'] },
  // Find
  { id: 'find', group: 'find', label: 'Find', keys: ['Mod+F'] },
  { id: 'replace', group: 'find', label: 'Find and replace', keys: ['Mod+H'] },
  { id: 'findNext', group: 'find', label: 'Next / previous match (in the find box)', keys: ['Enter', 'Shift+Enter'] },
  { id: 'replaceAll', group: 'find', label: 'Replace all (in the replace box)', keys: ['Mod+Enter'] },
  { id: 'matchCase', group: 'find', label: 'Match case / whole word / regular expression', keys: ['Alt+C', 'Alt+W', 'Alt+R'] },
  { id: 'goToLine', group: 'find', label: 'Go to line (or line:column)', keys: ['Mod+G'] },
  // Editing
  { id: 'indent', group: 'editing', label: 'Indent / outdent', keys: ['Tab', 'Shift+Tab'] },
  { id: 'toggleComment', group: 'editing', label: 'Comment or uncomment lines', keys: ['Mod+/'] },
  { id: 'moveLineUp', group: 'editing', label: 'Move lines up / down', keys: ['Alt+↑', 'Alt+↓'] },
  { id: 'copyLineDown', group: 'editing', label: 'Duplicate lines up / down', keys: ['Shift+Alt+↑', 'Shift+Alt+↓'] },
  { id: 'deleteLine', group: 'editing', label: 'Delete lines', keys: ['Mod+Shift+K'] },
  { id: 'indentMore', group: 'editing', label: 'Indent / outdent lines', keys: ['Mod+]', 'Mod+['] },
  { id: 'matchingBracket', group: 'editing', label: 'Jump to the matching bracket', keys: ['Mod+Shift+\\'] },
  { id: 'undo', group: 'editing', label: 'Undo / redo', keys: ['Mod+Z', isMac ? 'Mod+Shift+Z' : 'Mod+Y'] },
  { id: 'wrap', group: 'editing', label: 'Word wrap on / off', keys: ['Alt+Z'] },
  { id: 'bold', group: 'editing', label: 'Bold / italic (Markdown documents; elsewhere Ctrl/Cmd+B also shows or hides the sidebar)', keys: ['Mod+B', 'Mod+I'] },
  { id: 'complete', group: 'editing', label: 'Show suggestions (Enter accepts, Escape closes)', keys: ['Ctrl+Space'] },
  { id: 'problems', group: 'editing', label: 'Show problems (JSON, YAML)', keys: ['Mod+Shift+M'] },
  { id: 'nextProblem', group: 'editing', label: 'Go to the next problem', keys: ['F8'] },
  // Folding
  { id: 'fold', group: 'folding', label: 'Fold / unfold at the cursor', keys: isMac ? ['Mod+Alt+[', 'Mod+Alt+]'] : ['Ctrl+Shift+[', 'Ctrl+Shift+]'] },
  { id: 'foldAll', group: 'folding', label: 'Fold all / unfold all', keys: ['Ctrl+Alt+[', 'Ctrl+Alt+]'] },
  // Cursors
  { id: 'selectNext', group: 'cursors', label: 'Add the next occurrence to the selection', keys: ['Mod+D'] },
  { id: 'selectAll', group: 'cursors', label: 'Select every occurrence', keys: ['Mod+Shift+L'] },
  { id: 'addCursor', group: 'cursors', label: 'Add a cursor above / below', keys: ['Mod+Alt+↑', 'Mod+Alt+↓'] },
  { id: 'clickCursor', group: 'cursors', label: 'Add a cursor / select a block', keys: ['Mod+Click', 'Alt+Drag'] },
  { id: 'selectLine', group: 'cursors', label: 'Select the line', keys: [isMac ? 'Ctrl+L' : 'Alt+L'] },
  { id: 'singleCursor', group: 'cursors', label: 'Back to one cursor', keys: ['Escape'] },
]

const byId = new Map(SHORTCUTS.map((s) => [s.id, s]))
export const shortcut = (id) => byId.get(id)?.keys ?? []

// "Mod+Shift+P" -> "Ctrl+Shift+P", or "⌘⇧P" on a Mac.
const MAC = { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Enter: '↩', Escape: 'Esc', Tab: '⇥' }
export function keyLabel(combo, mac = isMac) {
  const parts = combo.split(/\+(?!$)/) // "Mod++" would be Mod and "+"
  if (!mac) return parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)).join('+')
  return parts.map((p) => MAC[p] ?? p).join('')
}
