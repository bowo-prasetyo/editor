// The Plumb palette (the top of src/style.css): every text colour keeps WCAG AA
// contrast (4.5:1) on the backgrounds it's used on, in light and dark, and the
// colours that must agree across files do.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { THEME_BAR, applyThemeBar } from '../src/themebar.js'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const css = read('src/style.css')

// The custom properties declared in the first block that starts with `opening`.
function block(opening) {
  const start = css.indexOf(opening)
  assert.ok(start >= 0, opening)
  let depth = 0
  let i = css.indexOf('{', start)
  const from = i
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) break
  }
  const vars = {}
  for (const [, name, value] of css.slice(from, i).matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[name] = value.trim()
  return vars
}

const light = block(':root {')
const darkMedia = block(":root:not([data-theme='light'])")
const darkChosen = block(":root[data-theme='dark']")
const themes = { light, dark: { ...light, ...darkMedia } }

// --- Colours ------------------------------------------------------------------

const hex = (h) => {
  const m = /^#([0-9a-f]{6})$/i.exec(h)
  assert.ok(m, `not a #rrggbb colour: ${h}`)
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16))
}
const toHex = (rgb) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')
const mix = (a, b, p) => toHex(hex(a).map((c, i) => c * p + hex(b)[i] * (1 - p)))

// Resolves var(--x), #hex, and color-mix(in srgb, A p%, B) where B may be
// `transparent` (then it's drawn over `under`).
function color(theme, value, under = theme.bg) {
  value = value.trim()
  const v = /^var\(--([\w-]+)\)$/.exec(value)
  if (v) return color(theme, theme[v[1]], under)
  const m = /^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(.+)\)$/.exec(value)
  if (m) {
    const b = m[3].trim() === 'transparent' ? color(theme, under) : color(theme, m[3], under)
    return mix(color(theme, m[1], under), b, Number(m[2]) / 100)
  }
  return toHex(hex(value))
}

const luminance = (h) => {
  const [r, g, b] = hex(h).map((c) => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// [what, text, background, minimum]. Backgrounds are written as in the CSS.
const PAIRS = [
  ['text', 'var(--fg)', 'var(--bg)'],
  ['text on panels', 'var(--fg)', 'var(--panel)'],
  ['muted text', 'var(--muted)', 'var(--bg)'],
  ['muted text on panels', 'var(--muted)', 'var(--panel)'],
  ['links', 'var(--accent)', 'var(--bg)'],
  ['accent on panels', 'var(--accent)', 'var(--panel)'],
  ['primary buttons', '#ffffff', 'var(--accent-fill)'],
  ['pressed toggles', 'var(--accent-text)', 'color-mix(in srgb, var(--accent) 15%, var(--panel))'],
  ['current item', 'var(--accent-text)', 'color-mix(in srgb, var(--accent) 16%, transparent)'],
  ['unsaved marks', 'var(--brass)', 'var(--bg)'],
  ['unsaved marks on panels', 'var(--brass)', 'var(--panel)'],
  ['danger', 'var(--danger)', 'var(--bg)'],
  ['danger on panels', 'var(--danger)', 'var(--panel)'],
  ['added in History', 'var(--success)', 'var(--bg)'],
  ['error banner', 'var(--fg)', 'color-mix(in srgb, var(--danger) 12%, var(--bg))'],
  ['info banner', 'var(--fg)', 'color-mix(in srgb, var(--accent) 10%, var(--bg))'],
  ['notice banner', 'var(--fg)', 'color-mix(in srgb, var(--highlight) 16%, var(--bg))'],
  ['find matches', 'var(--fg)', 'color-mix(in srgb, var(--highlight) 40%, transparent)'],
  ['selected text', 'var(--fg)', 'color-mix(in srgb, var(--accent) 28%, transparent)'],
  ['the cursor (a graphic: 3:1)', 'var(--accent)', 'var(--bg)', 3],
  ['focus outlines (a graphic: 3:1)', 'var(--accent)', 'var(--panel)', 3],
]
const SYNTAX = Object.keys(light).filter((k) => k.startsWith('syn-'))

for (const [name, theme] of Object.entries(themes)) {
  test(`${name}: text keeps 4.5:1 on its backgrounds`, () => {
    for (const [what, fg, bg, min = 4.5] of PAIRS) {
      const ratio = contrast(color(theme, fg), color(theme, bg))
      assert.ok(ratio >= min, `${what}: ${ratio.toFixed(2)}:1, needs ${min}:1`)
    }
  })

  test(`${name}: every syntax colour keeps 4.5:1 on the page and on the current line`, () => {
    assert.ok(SYNTAX.length >= 10)
    const activeLine = color(theme, 'color-mix(in srgb, var(--accent) 6%, transparent)')
    for (const k of SYNTAX) {
      for (const bg of [theme.bg, activeLine]) {
        const ratio = contrast(color(theme, `var(--${k})`), color(theme, bg))
        assert.ok(ratio >= 4.5, `--${k} on ${bg}: ${ratio.toFixed(2)}:1`)
      }
    }
  })
}

test('the two dark blocks (system dark mode, and Dark in Settings) are the same', () => {
  assert.deepEqual(darkChosen, darkMedia)
})

test('the title bar colour agrees in style.css, themebar.js, index.html and the manifest', () => {
  assert.equal(light['theme-bar'], THEME_BAR.light)
  assert.equal(darkMedia['theme-bar'], THEME_BAR.dark)
  const html = read('index.html')
  assert.match(html, new RegExp(`content="${THEME_BAR.light}" media="\\(prefers-color-scheme: light\\)"`))
  assert.match(html, new RegExp(`content="${THEME_BAR.dark}" media="\\(prefers-color-scheme: dark\\)"`))
  assert.equal(JSON.parse(read('public/manifest.webmanifest')).theme_color, THEME_BAR.light)
})

test('applyThemeBar: follows the system, or the theme chosen in Settings', () => {
  const metas = ['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)'].map((media) => {
    const attrs = { media, content: '' }
    return { attrs, getAttribute: (k) => attrs[k], setAttribute: (k, v) => (attrs[k] = v) }
  })
  const doc = { querySelectorAll: () => metas }
  const contents = () => metas.map((m) => m.attrs.content)
  applyThemeBar('system', doc)
  assert.deepEqual(contents(), [THEME_BAR.light, THEME_BAR.dark])
  applyThemeBar('dark', doc)
  assert.deepEqual(contents(), [THEME_BAR.dark, THEME_BAR.dark])
  applyThemeBar('light', doc)
  assert.deepEqual(contents(), [THEME_BAR.light, THEME_BAR.light])
})

test('no hard-coded colours outside the palette, except white on primary buttons and print', () => {
  const body = css.slice(css.indexOf("color-scheme: dark; }") )
  const stray = [...body.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase())
  assert.deepEqual([...new Set(stray)].sort(), ['#000', '#fff'])
  const cm = read('src/cm.js')
  assert.deepEqual(cm.match(/#[0-9a-f]{6}\b/gi), null, 'cm.js uses the palette variables')
})
