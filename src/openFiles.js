import { importFile, BinaryFileError } from './store'
import { showToast } from './toast'

// Text-ish files the picker offers (anything can still be dropped; binary
// files are detected and refused).
export const TEXT_ACCEPT = [
  'text/*', '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.xml', '.yaml', '.yml', '.toml',
  '.ini', '.cfg', '.conf', '.log', '.html', '.htm', '.css', '.js', '.mjs', '.ts', '.jsx', '.tsx',
  '.vue', '.py', '.rb', '.java', '.c', '.h', '.cpp', '.cs', '.go', '.rs', '.php', '.sh', '.bat',
  '.sql', '.srt', '.tex', '.rst', '.org', '.adoc', '.env', '.gitignore',
].join(',')

// Import files as new documents and open the last one. Returns the docs.
export async function openFiles(files, router) {
  const opened = []
  const refused = []
  for (const file of files) {
    try {
      opened.push(await importFile(file))
    } catch (e) {
      if (e instanceof BinaryFileError) refused.push(file.name)
      else throw e
    }
  }
  if (refused.length) {
    showToast(
      refused.length === 1
        ? `Couldn't open "${refused[0]}": it doesn't look like a text file.`
        : `Couldn't open ${refused.length} files: they don't look like text files.`,
    )
  } else if (opened.length > 1) {
    showToast(`Opened ${opened.length} files.`)
  }
  if (opened.length) router.push({ name: 'edit', params: { id: opened.at(-1).id } })
  return opened
}
