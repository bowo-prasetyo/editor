// Names for documents.

export const DEFAULT_NAME = 'Untitled.txt'

// "Shopping list for Saturday" -> "Shopping list for Saturday.txt"
export function nameFromContent(content, ext = 'txt') {
  const line = content.split('\n').find((l) => l.trim()) ?? ''
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
