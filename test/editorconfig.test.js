import { test } from 'node:test'
import assert from 'node:assert/strict'
import { editorSettings, globMatches, parseEditorConfig, propertiesFor } from '../src/editorconfig.js'

const SAMPLE = `# top-most EditorConfig file
root = true

[*]
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.{py,rb}]
indent_size = 4   # Python and Ruby

[Makefile]
indent_style = tab

; Markdown keeps its trailing spaces
[*.md]
trim_trailing_whitespace = false

[lib/**.js]
indent_size = 8
`

test('parses sections, properties, root and comments', () => {
  const c = parseEditorConfig(SAMPLE)
  assert.equal(c.root, true)
  assert.deepEqual(c.sections.map((s) => s.glob), ['*', '*.{py,rb}', 'Makefile', '*.md', 'lib/**.js'])
  assert.deepEqual(c.sections[1].props, { indent_size: '4' })
})

test('globs: names anywhere, paths from the file’s folder, sets, braces and ranges', () => {
  assert.equal(globMatches('*', 'a/b/c.txt'), true)
  assert.equal(globMatches('*.{py,rb}', 'src/x.rb'), true)
  assert.equal(globMatches('*.{py,rb}', 'src/x.js'), false)
  assert.equal(globMatches('Makefile', 'sub/Makefile'), true)
  assert.equal(globMatches('lib/**.js', 'lib/a/b.js'), true)
  assert.equal(globMatches('lib/**.js', 'src/lib/a.js'), false)
  assert.equal(globMatches('/lib/*.js', 'lib/a.js'), true)
  assert.equal(globMatches('src/**/*.ts', 'src/a.ts'), true)
  assert.equal(globMatches('*.[ch]', 'x.h'), true)
  assert.equal(globMatches('*.[!ch]', 'x.h'), false)
  assert.equal(globMatches('file{1..3}.txt', 'file2.txt'), true)
  assert.equal(globMatches('file{1..3}.txt', 'file4.txt'), false)
  assert.equal(globMatches('{x}', 'x'), false) // a single option is literal braces
  assert.equal(globMatches('a?c', 'abc'), true)
})

test('later sections and nearer files win; root = true stops the search above', () => {
  const outer = { dir: '', config: parseEditorConfig('[*]\nindent_size = 3\ntab_width = 6\n') }
  const top = { dir: '', config: parseEditorConfig(SAMPLE) }
  const inner = { dir: 'pkg', config: parseEditorConfig('[*.js]\nindent_style = tab\n') }
  assert.deepEqual(propertiesFor([top], 'x.py'), {
    indent_style: 'space', indent_size: '4', insert_final_newline: 'true', trim_trailing_whitespace: 'true',
  })
  assert.equal(propertiesFor([top, inner], 'pkg/a.js').indent_style, 'tab')
  assert.equal(propertiesFor([top, inner], 'other/a.js').indent_style, 'space')
  // A root=true file ignores what's above it.
  assert.equal(propertiesFor([outer, top], 'a.txt').tab_width, undefined)
  assert.equal(propertiesFor([outer], 'a.txt').tab_width, '6')
})

test('what the editor uses from the properties', () => {
  assert.deepEqual(editorSettings({ indent_style: 'space', indent_size: '4' }), { indent: { type: 'spaces', size: 4 } })
  assert.deepEqual(editorSettings({ indent_style: 'tab', tab_width: '8' }), { indent: { type: 'tabs', size: 8 } })
  assert.deepEqual(editorSettings({ indent_style: 'tab', indent_size: 'tab' }), { indent: { type: 'tabs', size: 4 } })
  assert.deepEqual(editorSettings({ indent_size: '2' }), { indentSize: 2 })
  assert.deepEqual(editorSettings({ trim_trailing_whitespace: 'false', insert_final_newline: 'true' }), { trim: false, finalNewline: true })
  assert.deepEqual(editorSettings({ indent_style: 'unset', insert_final_newline: 'unset', charset: 'utf-8' }), {})
})
