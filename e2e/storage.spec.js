// Documents kept in the browser: autosave, closing mid-save, storage
// failures, other tabs, the Trash. VISION.md principle 1, "Never lose text".
import { test, expect } from '@playwright/test'
import { editor, editorText, expectSaved, newDocument, saveStatus } from './helpers.js'

// Make IndexedDB refuse to save documents while window.__failWrites is true,
// as it does when the disk or the browser's quota is full.
async function breakStorage(page) {
  await page.addInitScript(() => {
    window.__failWrites = true
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args) {
      if (window.__failWrites && this.name === 'docs') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
}

const docId = (page) => new URL(page.url()).hash.split('/').pop()

test('typing is saved by itself and survives a reload', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('Shopping\nmilk\neggs')
  await expect(saveStatus(page)).toHaveText(/Saving…|Saved ✓/)
  await expectSaved(page)
  await page.reload()
  await expect(editor(page)).toBeVisible()
  expect(await editorText(page)).toBe('Shopping\nmilk\neggs')

  await page.goto('./')
  await expect(page.locator('.list-pane')).toContainText('Shopping')
})

test('text typed just before the tab closes is not lost', async ({ page, context }) => {
  await newDocument(page)
  const id = docId(page)
  // Close at once, inside the short pause before autosave would run.
  await page.keyboard.type('last words')
  await page.close({ runBeforeUnload: true })

  const again = await context.newPage()
  await again.goto(`./#/edit/${id}`)
  await expect(editor(again)).toBeVisible()
  expect(await editorText(again)).toBe('last words')
})

test('when browser storage fails, the problem is shown and Try again saves', async ({ page }) => {
  await breakStorage(page)
  await newDocument(page)
  await page.keyboard.type('important')
  await expect(saveStatus(page)).toHaveText('Not saved')
  const banner = page.getByRole('alert').filter({ hasText: 'Not saved.' })
  await expect(banner).toBeVisible()

  await page.evaluate(() => (window.__failWrites = false)) // space freed
  await banner.getByRole('button', { name: 'Try again' }).click()
  await expectSaved(page)
  await expect(banner).toBeHidden()
  await page.reload()
  await expect(editor(page)).toBeVisible()
  expect(await editorText(page)).toBe('important')
})

test('when browser storage fails and the tab is closed, a rescue copy brings the text back', async ({ page, context }) => {
  await breakStorage(page)
  await newDocument(page)
  const id = docId(page)
  await page.keyboard.type('rescue me')
  await expect(saveStatus(page)).toHaveText('Not saved')

  // Leaving warns first ("Leave site?"), because the text isn't safely stored.
  let warned = false
  page.on('dialog', (d) => ((warned = d.type() === 'beforeunload'), d.accept()))
  await page.close({ runBeforeUnload: true })
  await expect.poll(() => warned).toBe(true)

  // Storage works again (the rescue copy was kept in localStorage).
  const again = await context.newPage()
  await again.goto(`./#/edit/${id}`)
  await expect(editor(again)).toBeVisible()
  expect(await editorText(again)).toBe('rescue me')
  await expectSaved(again)
})

test('a document edited in one tab shows up in another', async ({ page, context }) => {
  await newDocument(page)
  const id = docId(page)
  await page.keyboard.type('from tab one')
  await expectSaved(page)

  const other = await context.newPage()
  await other.goto(`./#/edit/${id}`)
  await expect(editor(other)).toBeVisible()
  expect(await editorText(other)).toBe('from tab one')

  await editor(page).click()
  await page.keyboard.type(', and more')
  await expectSaved(page)
  await expect.poll(() => editorText(other)).toBe('from tab one, and more')
})

test('deleting a document can be undone', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('keep me safe')
  await expectSaved(page)
  await page.goto('./')

  const row = page.locator('.list-pane li').filter({ hasText: 'keep me safe' })
  await row.getByRole('button', { name: /delete|trash/i }).click()
  await expect(row).toHaveCount(0)
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect(row).toHaveCount(1)
})
