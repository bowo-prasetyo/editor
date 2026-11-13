// What this browser can do with files, said plainly (see VISION.md,
// "Platforms"). Chrome and Edge open folders and save straight back to
// files; Firefox and Safari get drafts and single files saved as downloads.
import { canSaveInPlace } from './fileaccess.js'
import { canOpenFolder } from './workspace.js'

// "Firefox", "Safari", or "this browser" (for the plain-words notes below).
export function browserName(ua = globalThis.navigator?.userAgent ?? '') {
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg\//.test(ua)) return 'Safari'
  return 'this browser'
}

// Can't save straight back to files here: Save downloads a copy.
export const savesAsDownloads = () => !canSaveInPlace()

export const FOLDER_NOTE = 'Opening folders needs Chrome or Edge. Your browser can open single files.'

// The one-time note on the start page, in a browser that saves as downloads.
export function downloadsNote(ua) {
  const name = browserName(ua)
  const where = name === 'this browser' ? 'In this browser' : `In ${name}`
  return `${where}, Save downloads a copy. To save straight back to your files, use Chrome or Edge.`
}

// After Save downloaded a copy: where it went.
export const downloadedMessage = (name) =>
  `Saved a copy, “${name}”, to your downloads folder. The file you opened isn’t changed.`

export { canOpenFolder, canSaveInPlace }
