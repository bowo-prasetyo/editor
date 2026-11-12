import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EditorSelection, EditorState } from '@codemirror/state'
import { ensureSyntaxTree, matchBrackets } from '@codemirror/language'
import { toggleComment } from '@codemirror/commands'
import { highlightTree } from '@lezer/highlight'
import { AUTO, PLAIN, findLanguage, languageNames, loadLanguage } from '../src/languages.js'
import { commentData, editingSetup, highlightStyle } from '../src/cm.js'

test('the language comes from the file name, unless one was picked', () => {
  const name = (file, choice) => findLanguage(file, choice)?.name ?? null
  assert.equal(name('app.ts'), 'TypeScript')
  assert.equal(name('script.PY'), 'Python')
  assert.equal(name('Dockerfile'), 'Dockerfile')
  assert.equal(name('notes.txt'), null)
  assert.equal(name('server.log'), null)
  assert.equal(name('Makefile'), 'Shell')
  assert.equal(name('.gitignore'), 'Properties files')
  assert.equal(name('deploy', 'Shell'), 'Shell', 'picked for a file with no extension')
  assert.equal(name('app.js', PLAIN), null, 'highlighting turned off')
  assert.equal(name('app.js', AUTO), 'JavaScript')
  assert.ok(languageNames.includes('Rust') && languageNames.length > 100)
})

async function stateFor(fileName, doc, selection) {
  const support = await loadLanguage(findLanguage(fileName))
  const state = EditorState.create({
    doc,
    selection,
    extensions: [editingSetup(), commentData(fileName), support ?? []],
  })
  ensureSyntaxTree(state, state.doc.length, 5000)
  return state
}

// Which colour class each piece of text gets.
function classes(state) {
  const out = {}
  const tree = ensureSyntaxTree(state, state.doc.length, 5000)
  highlightTree(tree, highlightStyle, (from, to, cls) => {
    out[state.sliceDoc(from, to)] = cls
  })
  return out
}

test('code is highlighted by token type', async () => {
  const js = classes(await stateFor('a.js', 'const n = 42 // note\nlet s = "hi"'))
  assert.equal(js['const'], js['let'], 'keywords share a class')
  assert.ok(js['42'] && js['"hi"'] && js['// note'])
  assert.notEqual(js['const'], js['42'])
  assert.notEqual(js['"hi"'], js['// note'])

  const py = classes(await stateFor('a.py', 'def f():\n    return None  # done'))
  assert.equal(py['def'], js['const'], 'same colours across languages')
  assert.equal(py['# done'], js['// note'])
})

test('a loaded language supplies its own comment syntax, including embedded ones', async () => {
  const doc = '<style>\np { color: red }\n</style>'
  const pos = doc.indexOf('p {')
  let state = await stateFor('page.html', doc, EditorSelection.single(pos))
  toggleComment({ state, dispatch: (tr) => (state = tr.state) })
  assert.match(state.doc.line(2).text, /^\/\* p \{ color: red \} \*\/$/, 'CSS comment inside HTML')
})

test('brackets are matched, with or without a language', async () => {
  for (const file of ['a.js', 'a.txt']) {
    const state = await stateFor(file, 'f(a[1], {b: 2})')
    const m = matchBrackets(state, 1, 1) // after "f"
    assert.ok(m?.matched, file)
    assert.equal(m.end.from, 'f(a[1], {b: 2}'.length, file)
    const bad = matchBrackets(await stateFor(file, 'f(a]'), 1, 1)
    assert.equal(bad?.matched ?? false, false, `${file}: mismatched bracket flagged`)
  }
})
