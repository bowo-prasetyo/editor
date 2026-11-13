// Theme and font from Settings, applied to the page as soon as it loads
// (before the app shows), so it doesn't flash in the wrong colours.
import { watchEffect } from 'vue'
import { prefs } from './prefs.js'
import { applyThemeBar } from './themebar.js'
import { t, translated } from './i18n.js'

export const THEMES = translated({ system: 'settings.themes.system', light: 'settings.themes.light', dark: 'settings.themes.dark' })

// Fonts offered in Settings; any other font installed can be typed in.
// [CSS font-family, name]; names in English are translated as they're shown.
export const FONTS = [
  ['', 'System monospace'],
  ['"JetBrains Mono", monospace', 'JetBrains Mono'],
  ['"Fira Code", monospace', 'Fira Code'],
  ['"Cascadia Code", "Cascadia Mono", monospace', 'Cascadia Code'],
  ['"SF Mono", Menlo, monospace', 'SF Mono / Menlo'],
  ['Consolas, monospace', 'Consolas'],
  ['"Source Code Pro", monospace', 'Source Code Pro'],
  ['"Courier New", Courier, monospace', 'Courier New'],
  ['system-ui, sans-serif', 'System sans-serif (proportional)'],
  ['Georgia, serif', 'Georgia (serif, proportional)'],
]
const FONT_KEYS = {
  'System monospace': 'settings.fonts.systemMono',
  'System sans-serif (proportional)': 'settings.fonts.systemSans',
  'Georgia (serif, proportional)': 'settings.fonts.georgia',
}
export const fontName = (name) => (FONT_KEYS[name] ? t(FONT_KEYS[name]) : name)

watchEffect(() => {
  const root = document.documentElement
  if (prefs.theme === 'light' || prefs.theme === 'dark') root.dataset.theme = prefs.theme
  else delete root.dataset.theme
  applyThemeBar(prefs.theme)
  // Fonts named by hand fall back to monospace if not installed.
  const font = String(prefs.font ?? '').trim()
  if (font) root.style.setProperty('--mono', /monospace|serif|sans-serif|system-ui/.test(font) ? font : `${font}, monospace`)
  else root.style.removeProperty('--mono')
})
