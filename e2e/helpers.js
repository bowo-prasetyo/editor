// Shared helpers for the end-to-end tests. See TESTING.md.
import { expect } from '@playwright/test'

// --- A stand-in for the user's disk ---------------------------------------------
//
// Headless browsers can't click through the system's file pickers. Instead,
// the pickers are replaced (before the app loads) with ones that hand back
// real file handles from the Origin Private File System (OPFS), under a
// "disk" folder. These are genuine FileSystemFileHandle objects: Plumb reads
// them, writes them, keeps them in IndexedDB and checks their dates exactly
// as it does with files on a real disk. The test reads and writes the same
// files to check bytes and to make "outside" changes.
//
// Before clicking something that opens a picker, say what the "user" picks:
//   await pick(page, ['notes.txt'])        // Open files…
//   await pick(page, 'copy.txt')           // Save as… (the name typed in)
//   await pick(page, 'project')            // Open folder… (a folder under disk/)
export async function useFakeDisk(page) {
  await page.addInitScript(() => {
    const disk = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('disk', { create: true })
    const at = async (path, kind, create) => {
      const parts = path.split('/').filter(Boolean)
      let dir = await disk()
      for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create })
      const last = parts.at(-1)
      return kind === 'directory' ? dir.getDirectoryHandle(last, { create }) : dir.getFileHandle(last, { create })
    }
    const take = () => {
      const choice = window.__pick
      window.__pick = undefined
      if (choice === undefined) throw new DOMException('The user aborted a request.', 'AbortError')
      return choice
    }
    window.showOpenFilePicker = async () => Promise.all([].concat(take()).map((p) => at(p, 'file', false)))
    window.showSaveFilePicker = async () => at(take(), 'file', true)
    window.showDirectoryPicker = async () => at(take(), 'directory', false)
  })
}

export const pick = (page, choice) => page.evaluate((c) => (window.__pick = c), choice)

// Write bytes (an array of numbers, or a string written as UTF-8) to disk/<path>.
export async function writeFile(page, path, content) {
  await page.evaluate(
    async ({ path, content }) => {
      const parts = path.split('/')
      let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('disk', { create: true })
      for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true })
      const handle = await dir.getFileHandle(parts.at(-1), { create: true })
      const w = await handle.createWritable()
      await w.write(typeof content === 'string' ? content : new Uint8Array(content))
      await w.close()
    },
    { path, content },
  )
}

// The bytes of disk/<path>, as an array of numbers.
export async function readBytes(page, path) {
  return page.evaluate(async (path) => {
    const parts = path.split('/')
    let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('disk')
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p)
    const file = await (await dir.getFileHandle(parts.at(-1))).getFile()
    return [...new Uint8Array(await file.arrayBuffer())]
  }, path)
}

export const readText = async (page, path) => Buffer.from(await readBytes(page, path)).toString('utf8')

// A file's date only moves forward when time has passed. Wait before an
// "outside" change so the app can tell it apart from its own last write.
export const tick = (page) => page.waitForTimeout(50)

// Pretend the user came back to the window (Plumb checks linked files then).
export const refocus = (page) => page.evaluate(() => window.dispatchEvent(new Event('focus')))

// --- The editor screen ------------------------------------------------------------

export const editor = (page) => page.locator('.editor .cm-content').first()
export const saveStatus = (page) => page.locator('footer.status .save').first()
export const fileStatus = (page) => page.locator('footer.status .save').nth(1)
export const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

// The document's text as the editor shows it. CodeMirror only draws the
// lines on screen, so this is for the short documents these tests use.
export const editorText = (page) =>
  editor(page).evaluate((el) => [...el.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'))

export async function newDocument(page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'New document' }).click()
  await expect(editor(page)).toBeVisible()
  await editor(page).click()
}

export async function openFromDisk(page, path) {
  await page.goto('./')
  await pick(page, [path])
  await page.getByRole('button', { name: 'Open files…' }).click()
  await expect(editor(page)).toBeVisible()
  await expect(fileStatus(page)).toHaveText('Saved to file')
}

export const expectSaved = (page) => expect(saveStatus(page)).toHaveText('Saved ✓')

// Save with the keyboard shortcut and wait until the file is written. The
// status may already say "Saved to file" before saving (an unedited file),
// so wait for this save's own "Saved to “name”." note instead.
export async function saveToFile(page) {
  await dismissToast(page)
  await editor(page).click()
  await page.keyboard.press(`${mod}+s`)
  await expect(page.locator('.toast')).toContainText(/^Saved to “/)
  await expect(fileStatus(page)).toHaveText('Saved to file')
}

export async function dismissToast(page) {
  const close = page.locator('.toast').getByRole('button', { name: 'Dismiss' })
  if (await close.isVisible()) await close.click()
  await expect(page.locator('.toast')).toHaveCount(0)
}

// Move the cursor to the end of the document.
export async function toEnd(page) {
  await editor(page).click()
  await page.keyboard.press(`${mod}+End`)
}
