import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyLineEnds, matchLines, recordLineEnds } from '../src/lineends.js'
import { decodeBytes, encodeText, fileFormat } from '../src/textcodec.js'

const utf8 = (s) => new TextEncoder().encode(s)
const text = (bytes) => new TextDecoder().decode(bytes)

// Open `raw`, change the text with `edit`, save: the file's bytes as text.
function openEditSave(raw, edit = (t) => t) {
  const d = decodeBytes(utf8(raw))
  return text(encodeText(edit(d.text), d).bytes)
}

test('a file with one kind of line ending has no record', () => {
  assert.equal(recordLineEnds('a\r\nb\r\nc'), null)
  assert.equal(recordLineEnds('a\nb\n'), null)
  assert.equal(recordLineEnds('no breaks'), null)
  assert.equal(decodeBytes(utf8('a\r\nb\r\n')).lineEnds, null)
})

test('a file that mixes line endings records each one', () => {
  const r = recordLineEnds('a\r\nb\nc\rd')
  assert.equal(r.ends, 'CLR')
  assert.equal(r.hashes.length, 4)
  const d = decodeBytes(utf8('a\r\nb\nc\r\n'))
  assert.equal(d.text, 'a\nb\nc\n')
  assert.equal(d.eol, '\r\n', 'the most common ending is still the main one')
  assert.equal(d.lineEnds.ends, 'CLC')
})

test('mixed line endings round-trip byte for byte, in every encoding', () => {
  const raw = 'one\r\ntwo\nthree\r\nfour\rfive'
  assert.equal(openEditSave(raw), raw)
  for (const encoding of ['utf-16le', 'utf-16be', 'windows-1252']) {
    const bytes = encodeText('x\ny', { encoding, bom: true }).bytes // any file in that encoding
    const d = decodeBytes(bytes)
    const out = encodeText(raw.replace(/\r\n?/g, '\n'), { ...d, lineEnds: recordLineEnds(raw) })
    assert.equal(decodeBytes(out.bytes).text, raw.replace(/\r\n?/g, '\n'))
    assert.equal(decodeBytes(out.bytes).lineEnds.ends, 'CLCR', encoding)
  }
})

test('untouched lines keep their endings; a new line gets the main one', () => {
  const raw = 'a\r\nb\nc\r\nd\r\n'
  // Insert a line after "b".
  assert.equal(openEditSave(raw, (t) => t.replace('b\n', 'b\nnew\n')), 'a\r\nb\nnew\r\nc\r\nd\r\n')
  // Delete "c".
  assert.equal(openEditSave(raw, (t) => t.replace('c\n', '')), 'a\r\nb\nd\r\n')
  // Add a line at the end and at the start.
  assert.equal(openEditSave(raw, (t) => 'top\n' + t + 'end'), 'top\r\na\r\nb\nc\r\nd\r\nend')
})

test('an edited line keeps its ending, also with lines added after it', () => {
  const raw = 'keep\r\nlf line\nkeep\r\n'
  assert.equal(openEditSave(raw, (t) => t.replace('lf line', 'LF LINE, edited')), 'keep\r\nLF LINE, edited\nkeep\r\n')
  assert.equal(openEditSave(raw, (t) => t.replace('lf line', 'edited\nadded')), 'keep\r\nedited\nadded\r\nkeep\r\n')
})

test('edits in several places keep the endings in between', () => {
  const lines = Array.from({ length: 40 }, (_, i) => `line ${i}`)
  const raw = lines.map((l, i) => l + (i % 3 ? '\r\n' : '\n')).join('')
  const out = openEditSave(raw, (t) => t.replace('line 5\n', 'line 5\ninserted\n').replace('line 30\n', ''))
  const expected = lines
    .flatMap((l, i) => (i === 30 ? [] : i === 5 ? [l + '\r\n', 'inserted\r\n'] : [l + (i % 3 ? '\r\n' : '\n')]))
    .join('')
  // line 5 ends in CRLF (5 % 3 ≠ 0); the inserted line takes the main ending (CRLF).
  assert.equal(out, expected)
})

test('moving lines around keeps each line’s ending where it can be matched', () => {
  const raw = 'alpha\nbeta\r\ngamma\r\ndelta\r\n'
  assert.equal(openEditSave(raw, () => 'gamma\nalpha\nbeta\ndelta\n'), 'gamma\r\nalpha\nbeta\r\ndelta\r\n')
})

test('after a save, the record describes what was written', () => {
  const d = decodeBytes(utf8('a\r\nb\nc\r\n'))
  const out = encodeText('a\nb\nnew\nc\n', d)
  assert.deepEqual(out.lineEnds, decodeBytes(out.bytes).lineEnds)
  // Saving again from that record changes nothing.
  assert.equal(text(encodeText('a\nb\nnew\nc\n', { ...d, lineEnds: out.lineEnds }).bytes), text(out.bytes))
})

test('when every remaining line has the same ending, the record goes away', () => {
  const d = decodeBytes(utf8('a\r\nb\nc\r\n'))
  const out = encodeText('a\nc\n', d) // the only LF line was deleted
  assert.equal(text(out.bytes), 'a\r\nc\r\n')
  assert.equal(out.lineEnds, null)
})

test('without a record, every line gets the document’s line ending (as before)', () => {
  assert.equal(text(encodeText('a\nb\n', { eol: '\r\n' }).bytes), 'a\r\nb\r\n')
  assert.equal(encodeText('a\nb\n', { eol: '\r\n' }).lineEnds, null)
})

test('a broken or stale record never changes the text', () => {
  for (const bad of [{}, { ends: 'CL', hashes: [1] }, { ends: 5, hashes: [] }]) {
    assert.equal(text(encodeText('a\nb\nc', { eol: '\n', lineEnds: bad }).bytes), 'a\nb\nc')
  }
  // Nothing in common with the record: the text is kept, with the main ending.
  const r = recordLineEnds('x\r\ny\nz')
  assert.equal(applyLineEnds('totally\ndifferent', r, '\r\n').text, 'totally\r\ndifferent')
  // Whatever the record says, only line endings can differ.
  for (const t of ['', 'x', 'x\ny', 'z\ny\nx\nw', '\n\n\n']) {
    assert.equal(applyLineEnds(t, r, '\n').text.replace(/\r\n?/g, '\n'), t)
  }
})

test('matchLines pairs unchanged lines, then the lines of each changed block by position', () => {
  assert.deepEqual(matchLines([1, 2, 3], [1, 2, 3]), [0, 1, 2])
  assert.deepEqual(matchLines([1, 2, 3], [1, 9, 2, 3]), [0, -1, 1, 2])
  assert.deepEqual(matchLines([1, 2, 3, 4], [1, 8, 9, 4]), [0, 1, 2, 3])
  assert.deepEqual(matchLines([1, 2, 3], [1, 8, 9, 3]), [0, 1, -1, 2], 'edited, then added')
  assert.deepEqual(matchLines([1, 2, 3, 4], [1, 8, 4]), [0, 1, 3], 'edited, and one deleted')
  assert.deepEqual(matchLines([1, 2, 3], [3]), [2])
  assert.deepEqual(matchLines([], [1, 2]), [-1, -1])
})

test('a big file with mixed endings and scattered edits saves quickly', () => {
  const n = 100_000
  const raw = Array.from({ length: n }, (_, i) => `row ${i}` + (i % 2 ? '\r\n' : '\n')).join('')
  const d = decodeBytes(utf8(raw))
  const edited = d.text.replace('row 10\n', 'row ten\n').replace('row 50000\n', '').replace('row 99998\n', 'row 99998\nadded\n')
  const t0 = performance.now()
  const out = text(encodeText(edited, d).bytes)
  const ms = performance.now() - t0
  assert.ok(ms < 1000, `took ${ms.toFixed(0)} ms`)
  assert.ok(out.startsWith('row 0\nrow 1\r\n'))
  assert.ok(out.includes('row 49999\r\nrow 50001\r\n'))
  assert.ok(out.includes('row ten\n'))
})

test('fileFormat leaves the line ending alone for a file with no line breaks', () => {
  assert.deepEqual(fileFormat(decodeBytes(utf8('one line'))), { encoding: 'utf-8', bom: false, lineEnds: null })
  assert.equal(fileFormat(decodeBytes(utf8('a\r\nb'))).eol, '\r\n')
})

test('a file rewritten beyond recognition still saves quickly, with its text unchanged', () => {
  const n = 50_000
  const raw = Array.from({ length: n }, (_, i) => `old ${i}` + (i % 2 ? '\r\n' : '\n')).join('')
  const d = decodeBytes(utf8(raw))
  const rewritten = Array.from({ length: n + 7 }, (_, i) => `new ${i}`).join('\n')
  const t0 = performance.now()
  const out = text(encodeText(rewritten, d).bytes)
  const ms = performance.now() - t0
  assert.ok(ms < 2000, `took ${ms.toFixed(0)} ms`)
  assert.equal(out.replace(/\r\n?/g, '\n'), rewritten)
  // Every old line counts as edited, so the endings pair up by position.
  assert.ok(out.startsWith('new 0\nnew 1\r\n'))
})
