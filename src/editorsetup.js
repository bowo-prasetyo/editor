// Shared by the editor and the second pane of a split (see EditorView.vue
// and SplitPane.vue): settings that come from Settings, the project, or
// another pane.
import { prefs } from './prefs.js'
import { lintKind, lintSource } from './lint.js'
import { editorConfigFor } from './workspace.js'
import { extension } from './filetype.js'

// --- Vim ------------------------------------------------------------------------------

// The Vim extension, loaded the first time it's turned on.
let vimLoad = null
export function loadVim() {
  vimLoad ??= import('@replit/codemirror-vim').then((m) => {
    // :w saves, like Ctrl/Cmd+S in the pane it's typed in (:wa saves all).
    const press = (cm, init) =>
      cm.cm6.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, ...init }))
    m.Vim.defineEx('write', 'w', (cm) => press(cm, {}))
    m.Vim.defineEx('wall', 'wa', (cm) => press(cm, { altKey: true }))
    return m.vim({ status: true })
  })
  return vimLoad
}

// The keyboard extension for the current setting (null: standard keys).
export const keysFor = async (keymap = prefs.keymap) => (keymap === 'vim' ? loadVim() : null)

// --- .editorconfig ------------------------------------------------------------------------

// What the project's .editorconfig says about a document opened from a
// folder, or null (see editorconfig.js).
export async function docEditorConfig(doc) {
  if (!prefs.editorConfig || !doc?.source) return null
  try {
    return await editorConfigFor(doc.source.root, doc.source.path)
  } catch {
    return null
  }
}

// --- Helpers ------------------------------------------------------------------------------

// Options for helpers() in cm.js: `code` when a programming language is
// loaded; `language` is its name (for JSON and YAML checking).
export function helpOptions({ code, name, language }) {
  return {
    code,
    closeBrackets: prefs.closeBrackets,
    autocomplete: prefs.autocomplete,
    guides: prefs.indentGuides,
    lint: prefs.lint ? lintSource(lintKind(name, language)) : null,
  }
}

// --- Whitespace when saving ----------------------------------------------------------------

export const isMarkdown = (name) => ['md', 'markdown', 'mdown'].includes(extension(name))

// { trim, finalNewline } for saving a document to its file: the project's
// .editorconfig if it says, else Settings (Markdown keeps its trailing
// spaces unless .editorconfig says otherwise).
export function saveFixes(doc, config) {
  return {
    trim: config?.trim ?? (prefs.trimOnSave && !isMarkdown(doc?.name)),
    finalNewline: config?.finalNewline ?? prefs.finalNewline,
  }
}

// --- Two panes on one document ------------------------------------------------------------

// Which pane last changed each document, so the other pane can keep that
// change out of its own undo history: Ctrl/Cmd+Z undoes your typing in the
// pane you typed in.
const lastEdit = new Map() // doc id -> { text, pane }
export const noteEdit = (id, text, pane) => lastEdit.set(id, { text, pane })
export const editedInOtherPane = (id, text, pane) => {
  const e = lastEdit.get(id)
  return !!e && e.text === text && e.pane !== pane
}
