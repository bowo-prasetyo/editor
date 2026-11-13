// The editor screen (src/views/EditorView.vue): the everyday actions,
// checked in a real browser.
import { test, expect } from '@playwright/test'
import { editor, editorText, expectSaved, mod, newDocument } from './helpers.js'

const nameField = (page) => page.getByRole('textbox', { name: 'File name' })

test('a new document is named after its first line until renamed, and the name is kept', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('Meeting notes\nagenda')
  await expect(nameField(page)).toHaveValue(/^Meeting notes/)

  await nameField(page).fill('minutes.md')
  await editor(page).click()
  await page.keyboard.type(' item')
  await expectSaved(page)
  await page.reload()
  await expect(nameField(page)).toHaveValue('minutes.md')
})

test('find and replace all, then undo it in one step', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('cat and cat and cat')
  await page.keyboard.press(`${mod}+h`)
  await page.getByLabel('Find', { exact: true }).fill('cat')
  await page.getByPlaceholder('Replace with').fill('dog')
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect.poll(() => editorText(page)).toBe('dog and dog and dog')

  await editor(page).click()
  await page.keyboard.press(`${mod}+z`)
  await expect.poll(() => editorText(page)).toBe('cat and cat and cat')
})

test('switching tabs keeps each document’s text and undo history', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('first')
  await expectSaved(page)
  await page.getByRole('navigation', { name: 'Open documents' }).getByRole('button', { name: 'New document' }).click()
  await editor(page).click()
  await page.keyboard.type('second')
  await expectSaved(page)

  await page.getByRole('tab', { name: /^first/ }).click()
  await expect.poll(() => editorText(page)).toBe('first')
  await editor(page).click()
  await page.keyboard.press(`${mod}+z`)
  await expect.poll(() => editorText(page)).toBe('')

  await page.getByRole('tab', { name: /^second/ }).click()
  await expect.poll(() => editorText(page)).toBe('second')
})

test('the quick switcher finds a document by name', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('Groceries list')
  await expectSaved(page)
  await page.goto('./')
  await expect(page.locator('.list-pane')).toContainText('Groceries list')
  await page.keyboard.press(`${mod}+p`)
  await expect(page.getByRole('dialog', { name: 'Go to document' })).toBeVisible()
  await page.keyboard.type('groc')
  await page.keyboard.press('Enter')
  await expect.poll(() => editorText(page)).toBe('Groceries list')
})

test('Markdown documents show a formatted preview', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('# Title\n\nSome **bold** text')
  await nameField(page).fill('doc.md')
  await editor(page).click()
  const preview = page.getByRole('article', { name: 'Preview' })
  if (!(await preview.isVisible())) await page.getByRole('button', { name: 'Preview' }).click()
  await expect(preview.getByRole('heading', { name: 'Title' })).toBeVisible()
  await expect(preview.locator('strong')).toHaveText('bold')
})

test('word wrap is remembered per document', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('x')
  const wrap = page.getByRole('button', { name: 'Wrap' })
  const before = await wrap.getAttribute('aria-pressed')
  await wrap.click()
  await expect(wrap).not.toHaveAttribute('aria-pressed', before)
  await expectSaved(page)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Wrap' })).not.toHaveAttribute('aria-pressed', before)
})
