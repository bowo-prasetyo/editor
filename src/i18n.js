// The words Plumb shows, in the user's language.
//
//   t('common.newDocument')                   -> "New document"
//   t('editor.words', { count: 3 })           -> "3 words"
//   t('save.saved', { name: 'a.txt' })        -> "Saved to “a.txt”."
//
// Messages live in src/locales/<language>.json, in the i18next JSON v4 format
// that translation tools (Weblate, Crowdin, Lokalise…) read and write:
// nested keys, {{name}} placeholders, and plural forms as sibling keys with
// the CLDR category as a suffix (drafts_one, drafts_few, drafts_other…),
// picked with Intl.PluralRules when the parameters include `count`.
// Numbers given as parameters are formatted for the locale.
//
// English is built in; other languages load when chosen, so each user only
// downloads their own (the service worker keeps it for offline use). A
// message missing from a translation falls back to English.
//
// "en-XA" is a pseudo-language for testing: English made longer and accented,
// in brackets, so text that isn't translatable, or gets cut off, stands out.
import { ref } from 'vue'
import en from './locales/en.json' with { type: 'json' }
import { formatNumber, setLocale } from './locale.js'

export const SOURCE = 'en'
export const PSEUDO = 'en-XA'

const catalogs = { [SOURCE]: en }
const loaders = {} // language -> () => Promise<messages>
const current = ref(SOURCE)

// The language the interface is in, e.g. "en".
export const language = () => current.value

// Tell the app which translations exist: { de: () => import(...) }.
export function registerCatalogs(map) {
  Object.assign(loaders, map)
}

// The languages that can be chosen, the source language first.
export const languages = () => [SOURCE, ...Object.keys(loaders).filter((l) => l !== SOURCE).sort()]

// --- Looking messages up ------------------------------------------------------------

const lookup = (messages, path) => path.split('.').reduce((node, part) => (node == null ? node : node[part]), messages)

const pluralRules = new Map()
function pluralCategory(lang, count) {
  if (!pluralRules.has(lang)) {
    let rules
    try {
      rules = new Intl.PluralRules(lang === PSEUDO ? SOURCE : lang)
    } catch {
      rules = new Intl.PluralRules(SOURCE)
    }
    pluralRules.set(lang, rules)
  }
  return pluralRules.get(lang).select(count)
}

function find(messages, lang, key, params) {
  if (typeof params.count === 'number') {
    const forms = [params.count === 0 && `${key}_zero`, `${key}_${pluralCategory(lang, params.count)}`, `${key}_other`]
    for (const k of forms) {
      const msg = k && lookup(messages, k)
      if (typeof msg === 'string') return msg
    }
  }
  const msg = lookup(messages, key)
  return typeof msg === 'string' ? msg : null
}

function interpolate(msg, params) {
  return msg.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, name) => {
    const value = params[name]
    if (value == null) return whole
    return typeof value === 'number' ? formatNumber(value) : String(value)
  })
}

const missing = new Set()

// The message for `key` in the current language (or `lang`), with `params`
// filled in.
export function t(key, params = {}, lang = current.value) {
  const msg = find(catalogs[lang] ?? en, lang, key, params) ?? find(en, SOURCE, key, params)
  if (msg == null) {
    if (!missing.has(key)) {
      missing.add(key)
      console.warn(`Missing message: ${key}`)
    }
    return key
  }
  return interpolate(msg, params)
}

// A table of words looked up as they're read: translated({ light: 'settings.themes.light' })
// gives an object whose `light` is t('settings.themes.light') in the current
// language, so lists built from it follow a change of language.
export function translated(keys) {
  const out = {}
  for (const [name, key] of Object.entries(keys)) Object.defineProperty(out, name, { get: () => t(key), enumerable: true })
  return out
}

// Whether a message exists (in English, which has them all).
export const hasMessage = (key) => typeof lookup(en, key) === 'string' || typeof lookup(en, `${key}_other`) === 'string'

// CodeMirror's own words (its search panel, folding, problems list…), by
// their English text, for EditorState.phrases.
export const editorPhrases = () => {
  const map = lookup(catalogs[current.value] ?? en, 'codemirror') ?? {}
  return Object.fromEntries(Object.entries(map).filter(([k, v]) => k !== v))
}

// --- Rich text ----------------------------------------------------------------------

// A message with a little markup, as [{ text, tag }] runs: <strong>, <em>,
// <kbd> and <code> only, never nested. Parameters are filled in after the
// markup is found, so a parameter's text is never read as markup. (Rendered
// by the T component, as text, never as HTML.)
const TAGS = /<(strong|em|kbd|code)>(.*?)<\/\1>/gs
export function richText(key, params = {}) {
  const lang = current.value
  const raw = find(catalogs[lang] ?? en, lang, key, params) ?? find(en, SOURCE, key, params) ?? key
  const runs = []
  let at = 0
  for (const m of raw.matchAll(TAGS)) {
    if (m.index > at) runs.push({ text: interpolate(raw.slice(at, m.index), params), tag: null })
    runs.push({ text: interpolate(m[2], params), tag: m[1] })
    at = m.index + m[0].length
  }
  if (at < raw.length) runs.push({ text: interpolate(raw.slice(at), params), tag: null })
  return runs
}

// --- Choosing the language ----------------------------------------------------------

const base = (tag) => tag.split('-')[0].toLowerCase()

// The best language Plumb has for these preferences (e.g. navigator.languages):
// an exact match, else the same language ("pt-BR" for "pt"), else English.
export function bestLanguage(preferred = [], available = languages()) {
  for (const want of preferred) {
    const exact = available.find((l) => l.toLowerCase() === String(want).toLowerCase())
    if (exact) return exact
    const same = available.find((l) => base(l) === base(String(want)))
    if (same) return same
  }
  return SOURCE
}

// Pseudo-translation: accented look-alikes, a third longer, in brackets, with
// {{placeholders}} and <tags> left as they are.
const ACCENTED = Object.fromEntries(
  [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c, i) => [c, [...'àƀçđéƒĝĥíĵķĺɱñóþǫŕšţúṽŵẋýžÀƁÇĐÉƑĜĤÍĴĶĹḾÑÓÞǪŔŠŢÚṼŴẊÝŽ'][i]]),
)
export function pseudo(msg) {
  const parts = msg.split(/(\{\{[^}]*\}\}|<\/?\w+>)/)
  const body = parts.map((p, i) => (i % 2 ? p : [...p].map((c) => ACCENTED[c] ?? c).join(''))).join('')
  const letters = msg.replace(/\{\{[^}]*\}\}|<\/?\w+>/g, '').length
  return `⟦${body}${'·'.repeat(Math.ceil(letters / 3))}⟧`
}
const pseudoCatalog = (node) =>
  typeof node === 'string' ? pseudo(node) : Object.fromEntries(Object.entries(node).map(([k, v]) => [k, pseudoCatalog(v)]))

async function load(lang) {
  if (catalogs[lang]) return catalogs[lang]
  if (lang === PSEUDO) return (catalogs[lang] = pseudoCatalog(en))
  try {
    const messages = await loaders[lang]?.()
    if (messages) catalogs[lang] = messages.default ?? messages
  } catch (e) {
    console.error(`Couldn't load the ${lang} translation`, e) // English it is
  }
  return catalogs[lang] ?? en
}

// Use `choice` ('' means the browser's languages) for the interface, and the
// matching locale for numbers and dates: the browser's own when it's the same
// language (so British English keeps British dates), else the language's.
export async function useLanguage(choice = '', browser = globalThis.navigator?.languages ?? []) {
  let lang = choice === PSEUDO ? PSEUDO : bestLanguage(choice ? [choice] : browser)
  if ((await load(lang)) === en) lang = SOURCE
  current.value = lang
  const runtime = new Intl.DateTimeFormat().resolvedOptions().locale
  const formatLang = lang === PSEUDO ? SOURCE : lang
  setLocale(base(runtime) === base(formatLang) ? runtime : formatLang)
  if (globalThis.document) document.documentElement.lang = lang
  return lang
}

// A language's name in that language ("Deutsch"), for the language picker.
export function languageName(lang) {
  if (lang === PSEUDO) return 'Pseudo (testing)'
  try {
    const name = new Intl.DisplayNames([lang], { type: 'language' }).of(lang)
    return name ? name[0].toLocaleUpperCase(lang) + name.slice(1) : lang
  } catch {
    return lang
  }
}
