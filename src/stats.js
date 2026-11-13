// Counting helpers for the status bar and line numbers. They run on every
// keystroke, so they scan the text without splitting it into arrays.
import { segmenter } from './locale.js'

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

// Scripts written without spaces between words: Chinese, Japanese, Thai,
// Lao, Khmer and Burmese. (Korean puts spaces between words.)
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u

// Words: runs of non-space characters, except that text in a script written
// without spaces is split into words by the browser's word breaker, so a
// Japanese sentence counts as its words rather than as one.
export function countWords(text) {
  const words = segmenter('word')
  if (!words || !UNSPACED.test(text)) return countSpaced(text)
  let n = 0
  for (const run of text.split(/\s+/)) {
    if (!run) continue
    if (!UNSPACED.test(run)) {
      n++
      continue
    }
    let inRun = 0
    for (const s of words.segment(run)) if (s.isWordLike) inRun++
    n += Math.max(1, inRun) // a run of punctuation still counts, as it would elsewhere
  }
  return n
}

// Whether counting words takes long enough to wait for a pause in typing:
// for a big text, or a long one in a script without spaces, which needs the
// (slower) word breaker.
export const slowToCount = (text) => text.length >= 200_000 || (text.length >= 20_000 && UNSPACED.test(text))

// Same as (text.match(/\S+/g) || []).length, without building the array.
const SPACE = /\s/
function countSpaced(text) {
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
