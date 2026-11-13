// The words Plumb shows, in the user's language (src/i18n.js), and the
// English catalog they come from (src/locales/en.json).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  PSEUDO,
  bestLanguage,
  editorPhrases,
  hasMessage,
  language,
  languageName,
  pseudo,
  registerCatalogs,
  richText,
  t,
  translated,
  useLanguage,
} from '../src/i18n.js'
import { locale } from '../src/locale.js'
import { SHORTCUTS } from '../src/keys.js'

const en = JSON.parse(readFileSync(new URL('../src/locales/en.json', import.meta.url)))

// A made-up translation, with Russian's plural forms (one, few, many).
const ru = {
  common: { newDocument: 'Новый документ' },
  editor: { words_one: '{{count}} слово', words_few: '{{count}} слова', words_many: '{{count}} слов', words_other: '{{count}} слова' },
}
registerCatalogs({ ru: async () => ru, broken: async () => Promise.reject(new Error('offline')) })

test('messages, with parameters filled in', () => {
  assert.equal(t('common.newDocument'), 'New document')
  assert.equal(t('save.saved', { name: 'a.txt' }), 'Saved to “a.txt”.')
  assert.equal(t('editor.words', { count: 1 }), '1 word')
  assert.equal(t('editor.words', { count: 1234 }), '1,234 words', 'numbers are formatted for the locale')
  assert.equal(t('editor.position', { line: '1234', col: '5' }), 'Ln 1234, Col 5', 'strings are left as they are')
  assert.equal(t('save.saved'), 'Saved to “{{name}}”.', 'a missing parameter stays visible')
  assert.equal(t('no.such.key'), 'no.such.key')
})

test('plural forms follow the language’s rules, and missing messages fall back to English', async () => {
  try {
    assert.equal(await useLanguage('ru'), 'ru')
    assert.equal(language(), 'ru')
    assert.equal(t('editor.words', { count: 1 }), '1 слово')
    assert.equal(t('editor.words', { count: 3 }), '3 слова')
    assert.equal(t('editor.words', { count: 5 }), '5 слов')
    assert.equal(t('editor.words', { count: 21 }), '21 слово')
    assert.equal(t('common.newDocument'), 'Новый документ')
    assert.equal(t('common.cancel'), 'Cancel', 'not translated yet: English')
    assert.equal(t('common.newDocument', {}, 'en'), 'New document', 'or a language asked for')
    assert.equal(locale(), 'ru', 'numbers and dates follow the language')
  } finally {
    await useLanguage('en')
  }
})

test('the browser’s languages pick the best one there is; a translation that fails to load leaves English', async () => {
  const have = ['en', 'pt-BR', 'ru']
  assert.equal(bestLanguage(['ru-RU', 'en'], have), 'ru', 'the same language')
  assert.equal(bestLanguage(['pt'], have), 'pt-BR')
  assert.equal(bestLanguage(['de-DE', 'fr'], have), 'en', 'English when there is none')
  assert.equal(bestLanguage([], have), 'en')
  try {
    assert.equal(await useLanguage('', ['ru-RU', 'en-US']), 'ru', 'no choice made: the browser’s')
    assert.equal(await useLanguage('broken'), 'en')
  } finally {
    await useLanguage('en')
  }
})

test('English keeps the browser’s own regional formats', async () => {
  await useLanguage('en')
  // In Node the runtime's default locale stands in for the browser's.
  const runtime = new Intl.DateTimeFormat().resolvedOptions().locale
  assert.equal(locale(), runtime.startsWith('en') ? runtime : 'en')
})

test('rich text: markup becomes runs, and parameters are never read as markup', () => {
  assert.deepEqual(richText('editor.changed', { name: 'a.txt' }), [{ text: '“a.txt” changed on disk.', tag: 'strong' }])
  assert.deepEqual(richText('unread.cantRead', { name: '<em>x</em>' }), [
    { text: '“<em>x</em>” can’t be read.', tag: 'strong' },
    { text: ' It isn’t on disk any more, or it isn’t a text file.', tag: null },
  ])
})

test('tables of words follow the language as they are read', async () => {
  const words = translated({ save: 'common.save' })
  assert.equal(words.save, 'Save')
  assert.deepEqual(Object.keys(words), ['save'])
  try {
    await useLanguage(PSEUDO)
    assert.match(words.save, /^⟦Šàṽé·+⟧$/)
    assert.equal(SHORTCUTS[0].label, t('shortcuts.labels.quickOpen'))
  } finally {
    await useLanguage('en')
  }
})

test('the pseudo-language: accented, a third longer, bracketed, with placeholders and markup kept', () => {
  assert.equal(pseudo('Save'), '⟦Šàṽé··⟧')
  assert.equal(pseudo('Saved to “{{name}}”.'), '⟦Šàṽéđ ţó “{{name}}”.····⟧')
  assert.equal(pseudo('<strong>Hi</strong>'), '⟦<strong>Ĥí</strong>·⟧')
  assert.equal(languageName(PSEUDO), 'Pseudo (testing)')
  assert.equal(languageName('de'), 'Deutsch')
  assert.equal(languageName('en'), 'English')
})

test('CodeMirror’s own words: only those that differ from English are passed on', async () => {
  assert.deepEqual(editorPhrases(), {})
  try {
    await useLanguage(PSEUDO)
    assert.equal(editorPhrases().Find, '⟦Ƒíñđ··⟧')
  } finally {
    await useLanguage('en')
  }
})

// --- The catalog -------------------------------------------------------------------

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.(js|vue)$/.test(name) ? [p] : []
  })
const source = files(new URL('../src', import.meta.url).pathname).map((f) => readFileSync(f, 'utf8')).join('\n')

// [[key, message]] for every message in a catalog.
const flatten = (node, path = '') =>
  Object.entries(node).flatMap(([k, v]) => {
    const key = path ? `${path}.${k}` : k
    return typeof v === 'string' ? [[key, v]] : flatten(v, key)
  })
const messages = flatten(en)
const PLURAL = /_(zero|one|two|few|many|other)$/
const baseKey = (key) => key.replace(PLURAL, '')

// Storage keys that look like messages (they predate the name Plumb).
const STORAGE = new Set(['editor.doc.', 'editor.documents.v1', 'editor.prefs.v1', 'editor.docs', 'editor.rescue.'])
// Keys built at run time, as `${prefix}${something}`.
const DYNAMIC = ['shortcuts.labels.', 'commands.settings.', 'codemirror.', 'tree.newFilePrompt', 'tree.newFolderPrompt', 'app.keptUntilSave', 'app.allSaved']

test('every message the code asks for is in the catalog', () => {
  const namespaces = Object.keys(en).join('|')
  const used = new Set(source.match(new RegExp(`(?<=['\`])(?:${namespaces})\\.[\\w.]+(?=['\`])`, 'g')))
  const missing = [...used].filter((key) => !hasMessage(key) && !STORAGE.has(key) && !DYNAMIC.some((p) => key.startsWith(p)))
  assert.deepEqual(missing, [])
  for (const s of SHORTCUTS) assert.ok(hasMessage(`shortcuts.labels.${s.id}`), s.id)
})

test('every message in the catalog is used', () => {
  const unused = [...new Set(messages.map(([key]) => baseKey(key)))].filter(
    (key) => !['\'', '`', '"'].some((q) => source.includes(q + key + q)) && !DYNAMIC.some((p) => key.startsWith(p)),
  )
  assert.deepEqual(unused, [])
})

test('plural messages have an "other" form, and every form takes the same parameters', () => {
  const params = (msg) => [...msg.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).filter((p) => p !== 'count').sort()
  const forms = new Map()
  for (const [key, msg] of messages) if (PLURAL.test(key)) forms.set(baseKey(key), [...(forms.get(baseKey(key)) ?? []), [key, msg]])
  for (const [base, list] of forms) {
    assert.ok(list.some(([k]) => k.endsWith('_other')), `${base}_other`)
    const first = JSON.stringify(params(list[0][1]))
    for (const [k, msg] of list) assert.equal(JSON.stringify(params(msg)), first, k)
  }
})

test('markup in messages is only what the T component renders, never nested', () => {
  for (const [key, msg] of messages) {
    if (key.startsWith('codemirror.')) continue
    const tags = msg.replace(/\$<\w+>/g, '').match(/<\/?(\w+)>/g) ?? [] // "$<name>" (a regex group) isn't markup
    for (const tag of tags) assert.match(tag, /^<\/?(strong|em|kbd|code)>$/, key)
    assert.doesNotMatch(msg, /<(strong|em|kbd|code)>[^<]*<(strong|em|kbd|code)>/, key)
  }
})

test('translations use the catalog’s keys and the same placeholders as English', () => {
  const dir = new URL('../src/locales/', import.meta.url)
  const params = (msg) => [...msg.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).filter((p) => p !== 'count').sort().join()
  const english = new Map(messages.map(([key, msg]) => [baseKey(key), params(msg)]))
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json')) {
    for (const [key, msg] of flatten(JSON.parse(readFileSync(new URL(file, dir))))) {
      assert.ok(english.has(baseKey(key)), `${file}: ${key} isn't in en.json`)
      if (!key.startsWith('codemirror.')) assert.equal(params(msg), english.get(baseKey(key)), `${file}: ${key}`)
    }
  }
})
