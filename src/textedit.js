// Apply { from, to, insert, selStart, selEnd } to a <textarea> through the
// browser's editing pipeline, so the change lands on the native undo stack
// (Ctrl/Cmd+Z keeps working). Setting el.value directly would wipe it.
export function applyEdit(el, edit) {
  el.focus()
  el.setSelectionRange(edit.from, edit.to)
  const ok =
    edit.insert === ''
      ? document.execCommand('delete', false)
      : document.execCommand('insertText', false, edit.insert)
  if (!ok) {
    el.setRangeText(edit.insert, edit.from, edit.to)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const end = edit.from + edit.insert.length
  el.setSelectionRange(edit.selStart ?? end, edit.selEnd ?? end)
}

const MIRROR_STYLES = [
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
  'tabSize', 'whiteSpace', 'overflowWrap', 'wordBreak', 'textIndent',
]

// Pixel offset of a character position inside a textarea's content.
function caretOffset(el, pos) {
  const cs = getComputedStyle(el)
  if (cs.whiteSpace === 'pre') {
    // No wrapping: rows are exactly one line each, so skip the layout work.
    const before = el.value.slice(0, pos)
    const row = before.split('\n').length - 1
    const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2
    const col = before.length - before.lastIndexOf('\n') - 1
    const ctx = (caretOffset.canvas ??= document.createElement('canvas')).getContext('2d')
    ctx.font = cs.font
    const tab = ' '.repeat(parseInt(cs.tabSize) || 8)
    const line = before.slice(before.length - col).replace(/\t/g, tab)
    return { top: parseFloat(cs.paddingTop) + row * lineHeight, left: parseFloat(cs.paddingLeft) + ctx.measureText(line).width, lineHeight }
  }
  // Wrapping: lay the text out in an invisible copy of the textarea.
  const mirror = document.createElement('div')
  for (const p of MIRROR_STYLES) mirror.style[p] = cs[p]
  // Same content width as the textarea (clientWidth excludes its scrollbar).
  Object.assign(mirror.style, {
    position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', overflow: 'hidden',
    height: 'auto', boxSizing: 'border-box', border: '0', width: el.clientWidth + 'px',
  })
  mirror.textContent = el.value.slice(0, pos)
  const marker = document.createElement('span')
  marker.textContent = '​'
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  // The marker's box is the font's height; centre it on the full line height.
  const lineHeight = parseFloat(cs.lineHeight) || marker.offsetHeight
  const top = marker.offsetTop - (lineHeight - marker.offsetHeight) / 2
  const result = { top, left: marker.offsetLeft, lineHeight }
  mirror.remove()
  return result
}

// Scroll a textarea so its selection is visible (setSelectionRange alone
// does not scroll when the textarea is not focused).
export function scrollSelectionIntoView(el) {
  const { top, left, lineHeight } = caretOffset(el, el.selectionStart)
  if (top < el.scrollTop || top + lineHeight > el.scrollTop + el.clientHeight) {
    el.scrollTop = Math.max(0, top - el.clientHeight / 3)
  }
  if (left < el.scrollLeft || left > el.scrollLeft + el.clientWidth - 40) {
    el.scrollLeft = Math.max(0, left - el.clientWidth / 2)
  }
  el.dispatchEvent(new Event('scroll'))
}

// Where the text from..to is drawn, relative to the textarea's offsetParent,
// for overlaying a highlight. Only the first row is covered if it wraps.
export function rangeRect(el, from, to) {
  const a = caretOffset(el, from)
  const b = caretOffset(el, to)
  const right = b.top === a.top ? b.left : el.scrollWidth
  return {
    top: el.offsetTop + el.clientTop + a.top - el.scrollTop,
    left: el.offsetLeft + el.clientLeft + a.left - el.scrollLeft,
    width: Math.max(2, right - a.left),
    height: a.lineHeight,
  }
}
