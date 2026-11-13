import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jsonProblems, lintKind, yamlProblems } from '../src/lint.js'

test('which files are checked', () => {
  assert.equal(lintKind('package.json'), 'json')
  assert.equal(lintKind('manifest.webmanifest'), 'json')
  assert.equal(lintKind('ci.yml'), 'yaml')
  assert.equal(lintKind('docker-compose.yaml'), 'yaml')
  assert.equal(lintKind('notes.txt'), null)
  assert.equal(lintKind('data', 'JSON'), 'json') // the language picked in the status bar
  // JSON with comments isn't strict JSON: left alone.
  assert.equal(lintKind('tsconfig.json'), null)
  assert.equal(lintKind('tsconfig.base.json'), null)
  assert.equal(lintKind('.vscode/settings.json'), null)
  assert.equal(lintKind('x.jsonc'), null)
})

test('JSON: valid text has no problems; an error points at its place', () => {
  assert.deepEqual(jsonProblems('{"a": [1, 2]}'), [])
  assert.deepEqual(jsonProblems('  '), [])
  const [p] = jsonProblems('{\n  "a": 1,\n}')
  assert.equal(p.severity, 'error')
  assert.ok(p.from >= 10 && p.from <= 12, `points near the stray comma's end, got ${p.from}`)
  assert.ok(p.message.length > 0 && !/position \d+/.test(p.message))
})

test('YAML: errors and warnings with their places, across documents', async () => {
  assert.deepEqual(await yamlProblems('a: 1\nb: [1, 2]\n---\nc: d\n'), [])
  const problems = await yamlProblems('a: 1\na: 2\n')
  assert.equal(problems.length, 1)
  assert.equal(problems[0].severity, 'error')
  assert.match(problems[0].message, /unique/i)
  assert.equal(problems[0].from, 5)
  const bad = await yamlProblems('key: "unclosed\n')
  assert.ok(bad.length >= 1 && bad.every((p) => p.to > p.from))
})
