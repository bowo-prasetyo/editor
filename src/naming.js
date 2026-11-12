// Names for documents.

export const DEFAULT_NAME = 'Untitled.txt'

// "Shopping list for Saturday" -> "Shopping list for Saturday.txt"
export function nameFromContent(content, ext = 'txt') {
  // Only the first non-blank line matters; don't split the whole (maybe huge) text.
  let line = ''
  for (let start = 0; start <= content.length; ) {
    const nl = content.indexOf('\n', start)
    const candidate = content.slice(start, nl === -1 ? content.length : nl)
    if (candidate.trim()) {
      line = candidate.slice(0, 1000)
      break
    }
    if (nl === -1) break
    start = nl + 1
  }
  let title = line
    .replace(/^\s*(#+|[-*+>]|\d+[.)])\s+/, '') // Markdown heading / list / quote markers
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '') // not allowed in file names
    .replace(/\s+/g, ' ')
    .trim()
  if (title.length > 40) title = title.slice(0, 40).replace(/\s+\S*$/, '') || title.slice(0, 40)
  title = title.replace(/[.\s]+$/, '')
  return title ? `${title}.${ext}` : DEFAULT_NAME
}

export const displayName = (name) => (name && name.trim() ? name : '(untitled)')
