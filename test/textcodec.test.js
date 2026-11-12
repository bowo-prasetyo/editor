import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeBytes, encodeText, detectEol } from '../src/textcodec.js'

const bytes = (...b) => new Uint8Array(b.flat())
const ascii = (s) => [...s].map((c) => c.charCodeAt(0))

// Decode then encode with the detected settings: the bytes must not change.
function roundTrip(input) {
  const d = decodeBytes(input)
  const { bytes: out, lossy } = encodeText(d.text, d)
  assert.equal(lossy, false)
  assert.deepEqual([...out], [...input])
  return d
}

test('UTF-8 with Windows line endings round-trips byte for byte', () => {
  const input = new TextEncoder().encode('café\r\nline 2\r\n')
  const d = roundTrip(input)
  assert.deepEqual([d.encoding, d.bom, d.eol, d.text], ['utf-8', false, '\r\n', 'café\nline 2\n'])
})

test('UTF-8 BOM is detected and kept', () => {
  const d = roundTrip(bytes([0xef, 0xbb, 0xbf], ascii('hi\n')))
  assert.deepEqual([d.encoding, d.bom, d.text], ['utf-8', true, 'hi\n'])
})

test('invalid UTF-8 falls back to Windows-1252 and round-trips', () => {
  // "café – “quoted”" in Windows-1252
  const d = roundTrip(bytes(ascii('caf'), 0xe9, 0x20, 0x96, 0x20, 0x93, ascii('quoted'), 0x94))
  assert.equal(d.encoding, 'windows-1252')
  assert.equal(d.text, 'café – “quoted”')
})

test('UTF-16 LE and BE, with and without BOM', () => {
  const le = (s) => [...s].flatMap((c) => [c.charCodeAt(0), 0])
  const be = (s) => [...s].flatMap((c) => [0, c.charCodeAt(0)])
  let d = roundTrip(bytes([0xff, 0xfe], le('Hello\r\n')))
  assert.deepEqual([d.encoding, d.bom, d.text], ['utf-16le', true, 'Hello\n'])
  d = roundTrip(bytes([0xfe, 0xff], be('Hello')))
  assert.deepEqual([d.encoding, d.bom], ['utf-16be', true])
  d = roundTrip(bytes(le('Plain old text without a BOM')))
  assert.deepEqual([d.encoding, d.bom, d.text], ['utf-16le', false, 'Plain old text without a BOM'])
})

test('old Mac CR line endings', () => {
  const d = roundTrip(bytes(ascii('a\rb\rc')))
  assert.deepEqual([d.eol, d.text], ['\r', 'a\nb\nc'])
})

test('binary files are refused', () => {
  assert.equal(decodeBytes(bytes(0x89, ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d)).binary, true)
})

test('text that does not fit Windows-1252 is saved as UTF-8 and flagged', () => {
  const r = encodeText('emoji 🙂', { encoding: 'windows-1252' })
  assert.equal(r.lossy, true)
  assert.equal(r.encoding, 'utf-8')
  assert.equal(new TextDecoder().decode(r.bytes), 'emoji 🙂')
})

test('detectEol picks the majority', () => {
  assert.equal(detectEol('a\r\nb\r\nc\n'), '\r\n')
  assert.equal(detectEol('a\nb\r\nc\n'), '\n')
  assert.equal(detectEol('no newline'), '\n')
})
