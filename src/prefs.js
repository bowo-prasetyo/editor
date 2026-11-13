import { reactive, watch } from 'vue'

// App-wide preferences (per browser), separate from documents.
const KEY = 'editor.prefs.v1'
export const FONT_SIZES = [11, 12, 13, 14, 16, 18, 20, 24, 28]
// tabs: open document ids; recent: recently opened, newest first; sort: how
// the list is ordered; folders: folders created while still empty.
// folderView: the folder shown in the document list ('' = all).
const defaults = { fontSize: 14, tabs: [], recent: [], sort: 'updated', folders: [], folderView: '' }

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) ?? {}
    const lists = Object.fromEntries(
      ['tabs', 'recent', 'folders'].map((k) => [k, Array.isArray(saved[k]) ? saved[k] : []]),
    )
    return { ...defaults, ...saved, ...lists }
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
