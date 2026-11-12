// Reading and writing text files without silently changing them: detect the
// encoding, byte-order mark and line endings on open, and write them back the
// same way on save. The editor itself always works with "\n" line endings.

export const ENCODINGS = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
  'windows-1252': 'Western (Windows-1252)',
}

export const EOLS = { '\n': 'LF', '\r\n': 'CRLF', '\r': 'CR' }

// Most common line ending in the text ("\n" when there are none).
export function detectEol(text) {
  let crlf = 0, lf = 0, cr = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\r') {
      if (text[i + 1] === '\n') { crlf++; i++ } else cr++
    } else if (c === '\n') lf++
  }
  if (crlf > lf && crlf >= cr) return '\r\n'
  if (cr > lf && cr > crlf) return '\r'
  return '\n'
}

export const normalizeEol = (text) => text.replace(/\r\n?/g, '\n')

// A file is treated as binary if its start has NUL bytes in a way that is not
// explained by UTF-16.
export function looksBinary(bytes, encoding) {
  if (encoding?.startsWith('utf-16')) return false
  const n = Math.min(bytes.length, 8000)
  for (let i = 0; i < n; i++) if (bytes[i] === 0) return true
  return false
}

// Guess UTF-16 without a BOM from the pattern of zero bytes in ASCII-heavy text.
function sniffUtf16(bytes) {
  const n = Math.min(bytes.length, 4000) & ~1
  if (n < 4) return null
  let even = 0, odd = 0
  for (let i = 0; i < n; i += 2) {
    if (bytes[i] === 0) even++
    if (bytes[i + 1] === 0) odd++
  }
  const half = n / 2
  if (odd > half * 0.4 && even < half * 0.05) return 'utf-16le'
  if (even > half * 0.4 && odd < half * 0.05) return 'utf-16be'
  return null
}

// bytes: Uint8Array. Returns { text, encoding, bom, eol, binary }.
export function decodeBytes(bytes) {
  let encoding = null
  let bom = false
  let start = 0
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    encoding = 'utf-8'; bom = true; start = 3
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = 'utf-16le'; bom = true; start = 2
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = 'utf-16be'; bom = true; start = 2
  } else {
    encoding = sniffUtf16(bytes)
  }
  const body = bytes.subarray(start)
  if (!encoding && looksBinary(body)) return { binary: true }
  let raw
  if (encoding) {
    raw = new TextDecoder(encoding).decode(body)
  } else {
    try {
      raw = new TextDecoder('utf-8', { fatal: true }).decode(body)
      encoding = 'utf-8'
    } catch {
      // Not valid UTF-8: almost always a legacy Western file.
      raw = new TextDecoder('windows-1252').decode(body)
      encoding = 'windows-1252'
    }
  }
  return { text: normalizeEol(raw), encoding, bom, eol: detectEol(raw), binary: false }
}

let cp1252 // char -> byte, for the 0x80–0x9F range that differs from Latin-1
function cp1252Byte(code) {
  if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) return code
  if (!cp1252) {
    cp1252 = new Map()
    const dec = new TextDecoder('windows-1252')
    for (let b = 0x80; b < 0xa0; b++) cp1252.set(dec.decode(new Uint8Array([b])).charCodeAt(0), b)
  }
  return cp1252.get(code) ?? -1
}

// Returns { bytes, encoding, lossy }. If the text can't be represented in the
// requested encoding, it is written as UTF-8 instead and `lossy` is true.
export function encodeText(text, { encoding = 'utf-8', bom = false, eol = '\n' } = {}) {
  const out = eol === '\n' ? text : text.replace(/\n/g, eol)
  if (encoding === 'windows-1252') {
    const bytes = new Uint8Array(out.length)
    for (let i = 0; i < out.length; i++) {
      const b = cp1252Byte(out.charCodeAt(i))
      if (b < 0) return { ...encodeText(text, { encoding: 'utf-8', bom, eol }), lossy: true }
      bytes[i] = b
    }
    return { bytes, encoding, lossy: false }
  }
  if (encoding === 'utf-16le' || encoding === 'utf-16be') {
    const le = encoding === 'utf-16le'
    const pre = bom ? 2 : 0
    const bytes = new Uint8Array(pre + out.length * 2)
    if (bom) bytes.set(le ? [0xff, 0xfe] : [0xfe, 0xff])
    for (let i = 0; i < out.length; i++) {
      const c = out.charCodeAt(i)
      bytes[pre + 2 * i + (le ? 0 : 1)] = c & 0xff
      bytes[pre + 2 * i + (le ? 1 : 0)] = c >> 8
    }
    return { bytes, encoding, lossy: false }
  }
  const body = new TextEncoder().encode(out)
  if (!bom) return { bytes: body, encoding: 'utf-8', lossy: false }
  const bytes = new Uint8Array(body.length + 3)
  bytes.set([0xef, 0xbb, 0xbf])
  bytes.set(body, 3)
  return { bytes, encoding: 'utf-8', lossy: false }
}
