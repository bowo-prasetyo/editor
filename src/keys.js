// Every keyboard shortcut, in one place: the shortcuts panel lists these, and
// the command palette shows them next to the commands they belong to.
// "Mod" is Ctrl, or Cmd on a Mac.

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export const SHORTCUTS = [
  // Documents
  { id: 'quickOpen', group: 'Documents', label: 'Go to a document (quick switcher)', keys: ['Mod+P'] },
  { id: 'palette', group: 'Documents', label: 'Run a command (command palette)', keys: ['Mod+Shift+P'] },
  { id: 'save', group: 'Documents', label: 'Save (to the file, or download)', keys: ['Mod+S'] },
  { id: 'saveAs', group: 'Documents', label: 'Save as…', keys: ['Mod+Shift+S'] },
  { id: 'prevTab', group: 'Documents', label: 'Previous tab', keys: ['Alt+PageUp'] },
  { id: 'nextTab', group: 'Documents', label: 'Next tab', keys: ['Alt+PageDown'] },
  { id: 'shortcuts', group: 'Documents', label: 'Show keyboard shortcuts', keys: ['F1', '?'] },
  { id: 'searchAll', group: 'Documents', label: 'Search (and replace) in all documents and folders', keys: ['Mod+Shift+F'] },
  { id: 'saveAll', group: 'Documents', label: 'Save all changed files', keys: ['Mod+Alt+S'] },
  { id: 'settings', group: 'Documents', label: 'Settings', keys: ['Mod+,'] },
  { id: 'split', group: 'Documents', label: 'Split the editor / close the split', keys: ['Mod+\\'] },
  { id: 'sidebar', group: 'Documents', label: 'Show / hide the folder sidebar', keys: ['Mod+B'] },
  // Find
  { id: 'find', group: 'Find', label: 'Find', keys: ['Mod+F'] },
  { id: 'replace', group: 'Find', label: 'Find and replace', keys: ['Mod+H'] },
  { id: 'findNext', group: 'Find', label: 'Next / previous match (in the find box)', keys: ['Enter', 'Shift+Enter'] },
  { id: 'replaceAll', group: 'Find', label: 'Replace all (in the replace box)', keys: ['Mod+Enter'] },
  { id: 'matchCase', group: 'Find', label: 'Match case / whole word / regular expression', keys: ['Alt+C', 'Alt+W', 'Alt+R'] },
  { id: 'goToLine', group: 'Find', label: 'Go to line (or line:column)', keys: ['Mod+G'] },
  // Editing
  { id: 'indent', group: 'Editing', label: 'Indent / outdent', keys: ['Tab', 'Shift+Tab'] },
  { id: 'toggleComment', group: 'Editing', label: 'Comment or uncomment lines', keys: ['Mod+/'] },
  { id: 'moveLineUp', group: 'Editing', label: 'Move lines up / down', keys: ['Alt+↑', 'Alt+↓'] },
  { id: 'copyLineDown', group: 'Editing', label: 'Duplicate lines up / down', keys: ['Shift+Alt+↑', 'Shift+Alt+↓'] },
  { id: 'deleteLine', group: 'Editing', label: 'Delete lines', keys: ['Mod+Shift+K'] },
  { id: 'indentMore', group: 'Editing', label: 'Indent / outdent lines', keys: ['Mod+]', 'Mod+['] },
  { id: 'matchingBracket', group: 'Editing', label: 'Jump to the matching bracket', keys: ['Mod+Shift+\\'] },
  { id: 'undo', group: 'Editing', label: 'Undo / redo', keys: ['Mod+Z', isMac ? 'Mod+Shift+Z' : 'Mod+Y'] },
  { id: 'wrap', group: 'Editing', label: 'Word wrap on / off', keys: ['Alt+Z'] },
  { id: 'complete', group: 'Editing', label: 'Show suggestions (Enter accepts, Escape closes)', keys: ['Ctrl+Space'] },
  { id: 'problems', group: 'Editing', label: 'Show problems (JSON, YAML)', keys: ['Mod+Shift+M'] },
  { id: 'nextProblem', group: 'Editing', label: 'Go to the next problem', keys: ['F8'] },
  // Folding
  { id: 'fold', group: 'Folding', label: 'Fold / unfold at the cursor', keys: isMac ? ['Mod+Alt+[', 'Mod+Alt+]'] : ['Ctrl+Shift+[', 'Ctrl+Shift+]'] },
  { id: 'foldAll', group: 'Folding', label: 'Fold all / unfold all', keys: ['Ctrl+Alt+[', 'Ctrl+Alt+]'] },
  // Cursors
  { id: 'selectNext', group: 'Cursors and selection', label: 'Add the next occurrence to the selection', keys: ['Mod+D'] },
  { id: 'selectAll', group: 'Cursors and selection', label: 'Select every occurrence', keys: ['Mod+Shift+L'] },
  { id: 'addCursor', group: 'Cursors and selection', label: 'Add a cursor above / below', keys: ['Mod+Alt+↑', 'Mod+Alt+↓'] },
  { id: 'clickCursor', group: 'Cursors and selection', label: 'Add a cursor / select a block', keys: ['Mod+Click', 'Alt+Drag'] },
  { id: 'selectLine', group: 'Cursors and selection', label: 'Select the line', keys: [isMac ? 'Ctrl+L' : 'Alt+L'] },
  { id: 'singleCursor', group: 'Cursors and selection', label: 'Back to one cursor', keys: ['Escape'] },
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
