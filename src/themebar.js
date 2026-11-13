// The browser's (or installed app's) title bar takes the colour of Plumb's top
// bar: --theme-bar in style.css (test/palette.test.js keeps them the same).
// index.html has one <meta name="theme-color"> per system scheme; when Settings
// choose Light or Dark, both say that theme's colour.
export const THEME_BAR = { light: '#f4f6fa', dark: '#151c26' }

export function applyThemeBar(theme, doc = document) {
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
    const scheme = /dark/.test(meta.getAttribute('media') ?? '') ? 'dark' : 'light'
    meta.setAttribute('content', THEME_BAR[theme in THEME_BAR ? theme : scheme])
  }
}
