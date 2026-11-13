// "Save all": write every document with changes not saved to its file,
// with the same whitespace fixes as saving one file (see EditorView.vue).
import { saveAllToFiles, unsavedToDisk } from './fileaccess.js'
import { fixWhitespaceText } from './textops.js'
import { updateDoc } from './store.js'
import { showToast } from './toast.js'
import { docEditorConfig, saveFixes } from './editorsetup.js'

// Trailing spaces and the final line break, if Settings or the project's
// .editorconfig say so (Markdown keeps its trailing spaces: they mean a
// line break).
export async function prepareForSave(doc) {
  const { trim, finalNewline } = saveFixes(doc, await docEditorConfig(doc))
  if (!trim && !finalNewline) return
  const text = fixWhitespaceText(doc.content, { trim, finalNewline })
  if (text !== doc.content) updateDoc(doc.id, { content: text })
}

let busy = false
export async function saveAll() {
  if (busy) return
  if (!unsavedToDisk().length) return showToast('Every file is saved.', { timeout: 2500 })
  busy = true
  try {
    const { saved, cancelled, failed } = await saveAllToFiles({ prepare: prepareForSave })
    const parts = [`Saved ${saved} file${saved === 1 ? '' : 's'}.`]
    if (cancelled) parts.push(`${cancelled} not saved.`)
    if (failed.length) parts.push(`Couldn't save ${failed.map((n) => `“${n}”`).join(', ')}.`)
    showToast(parts.join(' '), { timeout: failed.length ? 10000 : 4000 })
  } finally {
    busy = false
  }
}
