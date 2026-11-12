// Counting helpers for the status bar and line numbers. They run on every
// keystroke, so they scan the text without splitting it into arrays.

// Number of lines (a text with no newline has one line).
export function countLines(text) {
  let n = 1
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++
  return n
}

// Line and column (both from 1) of a position in the text.
export function lineColAt(text, pos) {
  let line = 1
  let lineStart = 0
  for (let i = text.indexOf('\n'); i !== -1 && i < pos; i = text.indexOf('\n', i + 1)) {
    line++
    lineStart = i + 1
  }
  return { line, col: pos - lineStart + 1 }
}

// Same as (text.match(/\S+/g) || []).length, without building the array.
const SPACE = /\s/
export function countWords(text) {
  let words = 0
  let inWord = false
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    const space =
      c === 32 || (c >= 9 && c <= 13) || (c > 127 && (c === 0xa0 || c >= 0x1680) && SPACE.test(text[i]))
    if (space) inWord = false
    else if (!inWord) {
      inWord = true
      words++
    }
  }
  return words
}
