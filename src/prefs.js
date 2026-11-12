import { reactive, watch } from 'vue'

// App-wide preferences (per browser), separate from documents.
const KEY = 'editor.prefs.v1'
export const FONT_SIZES = [11, 12, 13, 14, 16, 18, 20, 24, 28]
const defaults = { fontSize: 14 }

function load() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY)) }
  } catch {
    return { ...defaults }
  }
}

export const prefs = reactive(load())

watch(prefs, (p) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Preferences are a convenience; ignore storage errors.
  }
})

export function stepFontSize(dir) {
  const i = FONT_SIZES.findIndex((s) => s >= prefs.fontSize)
  const at = i === -1 ? FONT_SIZES.length - 1 : i
  prefs.fontSize = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, at + dir))]
}
