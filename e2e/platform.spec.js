// Firefox and Safari: what Plumb promises there, and how it says what's
// missing (VISION.md, "The Firefox and Safari promise"; src/platform.js).
// Chromium is made to look like them by hiding the File System Access API.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { editor, expectSaved, mod } from './helpers.js'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    delete window.showOpenFilePicker
    delete window.showSaveFilePicker
    delete window.showDirectoryPicker
    delete window.FileSystemObserver
  })
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'New document' })).toBeVisible()
})

test('Open folder… is shown, disabled, with the reason', async ({ page }) => {
  const button = page.getByRole('button', { name: 'Open folder…' })
  await expect(button).toBeDisabled()
  await expect(button).toHaveAccessibleDescription('Opening folders needs Chrome or Edge. Your browser can open single files.')
  await expect(page.locator('#folder-note')).toBeVisible()
})

test('a one-time note says Save downloads a copy; once dismissed, it stays away', async ({ page }) => {
  const note = page.getByRole('status').filter({ hasText: 'Save downloads a copy' })
  await expect(note).toContainText('To save straight back to your files, use Chrome or Edge.')
  await note.getByRole('button', { name: 'OK' }).click()
  await expect(note).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'New document' })).toBeVisible()
  await expect(note).toHaveCount(0)
})

test('Save downloads a faithful copy and says where it went', async ({ page }) => {
  await page.getByRole('button', { name: 'New document' }).click()
  await editor(page).click()
  await page.keyboard.type('line one\nline two')
  await expectSaved(page)
  await page.getByRole('combobox', { name: 'Line endings used when downloading' }).selectOption({ label: 'CRLF' })
  await editor(page).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press(`${mod}+s`)])
  expect(download.suggestedFilename()).toBe('line one.md')
  expect(fs.readFileSync(await download.path(), 'utf8')).toBe('line one\r\nline two')
  await expect(page.locator('.toast')).toContainText('Saved a copy, “line one.md”, to your downloads folder. The file you opened isn’t changed.')
})

test('Chrome and Edge get no such notes', async ({ browser }) => {
  const page = await browser.newPage()
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'New document' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open folder…' })).toBeEnabled()
  await expect(page.locator('#folder-note')).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Save downloads a copy' })).toHaveCount(0)
  await page.close()
})
