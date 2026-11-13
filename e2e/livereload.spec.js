// Files changed by other programs: follow them when it's safe, ask when it
// isn't, never replace unsaved text. VISION.md principles 1 and 2.
import { test, expect } from '@playwright/test'
import {
  editor,
  editorText,
  fileStatus,
  mod,
  openFromDisk,
  refocus,
  saveToFile,
  tick,
  toEnd,
  useFakeDisk,
  writeFile,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await useFakeDisk(page)
  await page.goto('./')
  await writeFile(page, 'live.txt', 'version one\n')
  await openFromDisk(page, 'live.txt')
})

const changedBanner = (page) => page.getByRole('alert').filter({ hasText: 'changed on disk' })

test('a document with nothing unsaved follows its file, and Undo brings the old text back', async ({ page }) => {
  await tick(page)
  await writeFile(page, 'live.txt', 'version two\n')
  await refocus(page)
  await expect.poll(() => editorText(page)).toBe('version two\n')
  await expect(page.locator('.toast')).toContainText('changed on disk')
  await expect(fileStatus(page)).toHaveText('Saved to file')

  await editor(page).click()
  await page.keyboard.press(`${mod}+z`)
  await expect.poll(() => editorText(page)).toBe('version one\n')
})

test('unsaved text is never replaced: Keep mine keeps it, and Save still asks', async ({ page }) => {
  await toEnd(page)
  await page.keyboard.type('my edit')
  await tick(page)
  await writeFile(page, 'live.txt', 'their edit\n')
  await refocus(page)
  await expect(changedBanner(page)).toBeVisible()
  expect(await editorText(page)).toBe('version one\nmy edit')

  await changedBanner(page).getByRole('button', { name: 'Keep mine' }).click()
  await expect(changedBanner(page)).toBeHidden()
  expect(await editorText(page)).toBe('version one\nmy edit')

  let asked = false
  page.once('dialog', (d) => ((asked = true), d.dismiss()))
  await editor(page).click()
  await page.keyboard.press(`${mod}+s`)
  await expect.poll(() => asked).toBe(true)
})

test('Reload from disk takes the file’s text and keeps the unsaved text in History', async ({ page }) => {
  await toEnd(page)
  await page.keyboard.type('my edit')
  await tick(page)
  await writeFile(page, 'live.txt', 'their edit\n')
  await refocus(page)
  await changedBanner(page).getByRole('button', { name: 'Reload from disk' }).click()
  await expect.poll(() => editorText(page)).toBe('their edit\n')
  await expect(fileStatus(page)).toHaveText('Saved to file')

  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.locator('.history')).toContainText(/before reloading/i)
})

test('a file deleted on disk keeps its text, and says so', async ({ page }) => {
  await page.evaluate(async () => {
    const disk = await (await navigator.storage.getDirectory()).getDirectoryHandle('disk')
    await disk.removeEntry('live.txt')
  })
  await refocus(page)
  await expect(page.getByRole('status').filter({ hasText: 'deleted or moved on disk' })).toBeVisible()
  await expect(fileStatus(page)).toHaveText('File not on disk')
  expect(await editorText(page)).toBe('version one\n')
})

test('Plumb’s own save is not mistaken for a change on disk', async ({ page }) => {
  await toEnd(page)
  await page.keyboard.type('saved here')
  await saveToFile(page)
  await refocus(page)
  await page.waitForTimeout(300)
  await expect(changedBanner(page)).toHaveCount(0)
  expect(await editorText(page)).toBe('version one\nsaved here')
})
