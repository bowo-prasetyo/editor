import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Markdown to safe HTML. Documents can come from anywhere (opened files,
// backups), so the output is sanitised before it is put on the page.
export function renderMarkdown(text) {
  const html = marked.parse(text, { gfm: true, breaks: false, async: false })
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}

// Links in the preview open in a new tab so they don't replace the editor.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})
