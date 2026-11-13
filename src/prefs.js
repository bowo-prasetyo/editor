import { reactive, watch } from 'vue'

// App-wide preferences (per browser), separate from documents.
const KEY = 'editor.prefs.v1'
export const FONT_SIZES = [11, 12, 13, 14, 16, 18, 20, 24, 28]
// tabs: open document ids; recent: recently opened, newest first; sort: how
// the list is ordered; folders: folders created while still empty.
// folderView: the folder shown in the document list ('' = all).
// Editing helpers (for code): closeBrackets, autocomplete, indentGuides.
// When saving to a file: trimOnSave (trailing spaces; never in Markdown,
// where they mean a line break) and finalNewline.
// workspaces: folders opened from disk ({ id, name }), with sidebar
// (shown or hidden) and expanded (folder paths open in the tree, by id).
const defaults = {
  fontSize: 14,
  tabs: [],
  recent: [],
  sort: 'updated',
  folders: [],
  folderView: '',
  closeBrackets: true,
  autocomplete: true,
  indentGuides: true,
  trimOnSave: false,
  finalNewline: false,
  workspaces: [],
  sidebar: true,
  expanded: {},
  // Settings page (see SettingsView.vue).
  theme: 'system', // 'system' | 'light' | 'dark'
  font: '', // CSS font-family for text; '' = the system's monospace font
  keymap: 'standard', // 'standard' | 'vim'
  lint: true, // check JSON and YAML as you type
  editorConfig: true, // follow .editorconfig files in open folders
  liveReload: true, // reload documents whose files change on disk (see livereload.js)
  indentDefault: { type: 'spaces', size: 2 }, // for file types without a convention
  wrapProse: true,
  wrapCode: false,
  split: null, // the document shown in the right-hand pane, if split
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) ?? {}
    const lists = Object.fromEntries(
      ['tabs', 'recent', 'folders', 'workspaces'].map((k) => [k, Array.isArray(saved[k]) ? saved[k] : []]),
    )
    const expanded = saved.expanded && typeof saved.expanded === 'object' ? saved.expanded : {}
    const indentDefault = ['spaces', 'tabs'].includes(saved.indentDefault?.type) && +saved.indentDefault.size > 0
      ? saved.indentDefault
      : defaults.indentDefault
    return { ...defaults, ...saved, ...lists, expanded, indentDefault }
  } catch {
    return structuredClone(defaults)
  }
}

export const prefs = reactive(load())

watch(
  prefs,
  (p) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Preferences are a convenience; ignore storage errors.
  }
  },
  { deep: true },
)

export function stepFontSize(dir) {
  const i = FONT_SIZES.findIndex((s) => s >= prefs.fontSize)
  const at = i === -1 ? FONT_SIZES.length - 1 : i
  prefs.fontSize = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, at + dir))]
}
