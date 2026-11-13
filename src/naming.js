// Names for documents.
import { segmenter } from './locale.js'
import { t } from './i18n.js'

// New drafts are Markdown (see docs/markdown.md); plain text is valid Markdown.
// "Untitled.md", in the interface language.
export const defaultName = () => `${t('naming.untitled')}.md`

// "Shopping list for Saturday" -> "Shopping list for Saturday.md"
export function nameFromContent(content, ext = 'md') {
  // Only the first non-blank line matters; don't split the whole (maybe huge) text.
  let line = ''
  for (let start = 0; start <= content.length; ) {
    const nl = content.indexOf('\n', start)
    const candidate = content.slice(start, nl === -1 ? content.length : nl)
    if (candidate.trim()) {
      line = clip(candidate, 1000)
      break
    }
    if (nl === -1) break
    start = nl + 1
  }
  let title = line
    .replace(/^\s*(#+|[-*+>]|\d+[.)])\s+/, '') // Markdown heading / list / quote markers
    // eslint-disable-next-line no-control-regex -- control characters are exactly what's removed
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '') // not allowed in file names
    .replace(/\s+/g, ' ')
    .trim()
  if (title.length > 40) {
    const cut = clip(title, 40)
    title = cut.replace(/\s+\S*$/, '') || cut
  }
  title = title.replace(/[.\s]+$/, '')
  return title ? `${title}.${ext}` : defaultName()
}

// At most `max` UTF-16 code units of `text`, cut between characters as
// people see them: never through an emoji, a letter and its accent, or a
// surrogate pair.
export function clip(text, max) {
  if (text.length <= max) return text
  const graphemes = segmenter('grapheme')
  if (!graphemes) return text.slice(0, max).replace(/[\uD800-\uDBFF]$/, '')
  let end = 0
  for (const { index, segment } of graphemes.segment(text)) {
    if (index + segment.length > max) break
    end = index + segment.length
  }
  return text.slice(0, end)
}

export const displayName = (name) => (name && name.trim() ? name : t('naming.noName'))
