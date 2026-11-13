// Markdown as a first-class kind of document, phase 1 (docs/markdown.md):
// new drafts are Markdown; bold and italic; Ctrl/Cmd+B elsewhere and the
// Folders button.
import { test, expect } from '@playwright/test'
import { editor, editorText, expectSaved, mod, newDocument, pick, useFakeDisk, writeFile } from './helpers.js'

const nameField = (page) => page.getByRole('textbox', { name: 'File name' })
const tree = (page) => page.getByRole('tree', { name: 'Files' })

test('a new draft is Markdown: named .md, with the preview one click away (off at first)', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('# Meeting notes\n\n- one')
  await expect(nameField(page)).toHaveValue('Meeting notes.md')
  const preview = page.getByRole('button', { name: 'Preview' })
  await expect(preview).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('article', { name: 'Preview' })).toHaveCount(0)
  await preview.click()
  await expect(page.getByRole('article', { name: 'Preview' }).getByRole('heading', { name: 'Meeting notes' })).toBeVisible()
})

test('the quick switcher’s new drafts are Markdown too', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'New document' })).toBeVisible()
  await page.keyboard.press(`${mod}+p`)
  await page.keyboard.type('ideas')
  await page.keyboard.press('Enter')
  await expect(nameField(page)).toHaveValue('ideas.md')
})

test('Ctrl/Cmd+B and Ctrl/Cmd+I make the selection bold or italic, and back', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('hello world')
  await page.keyboard.press('Shift+Control+ArrowLeft') // select "world"
  await page.keyboard.press(`${mod}+b`)
  await expect.poll(() => editorText(page)).toBe('hello **world**')
  await page.keyboard.press(`${mod}+b`)
  await expect.poll(() => editorText(page)).toBe('hello world')
  await page.keyboard.press(`${mod}+i`)
  await expect.poll(() => editorText(page)).toBe('hello *world*')

  // Nothing selected: the pair, with the cursor between.
  await page.keyboard.press('End')
  await page.keyboard.type(' ')
  await page.keyboard.press(`${mod}+b`)
  await page.keyboard.type('new')
  await expect.poll(() => editorText(page)).toBe('hello *world* **new**')
  await expectSaved(page)
})

test.describe('with a folder open', () => {
  test.beforeEach(async ({ page }) => {
    await useFakeDisk(page)
    await page.goto('./')
    await writeFile(page, 'project/app.js', 'let x = 1\n')
    await writeFile(page, 'project/notes.md', 'notes\n')
    await pick(page, 'project')
    await page.getByRole('button', { name: 'Open folder…' }).click()
    await expect(tree(page)).toBeVisible()
  })

  test('the Folders button shows and hides the sidebar', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Folders' })
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await button.click()
    await expect(tree(page)).toHaveCount(0)
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await button.click()
    await expect(tree(page)).toBeVisible()
  })

  test('outside Markdown, Ctrl/Cmd+B still shows and hides the sidebar; in Markdown it means bold', async ({ page }) => {
    await tree(page).getByRole('treeitem').filter({ hasText: 'app.js' }).click()
    await expect.poll(() => editorText(page)).toBe('let x = 1\n')
    await editor(page).click()
    await page.keyboard.press(`${mod}+b`)
    await expect(tree(page)).toHaveCount(0)
    expect(await editorText(page)).toBe('let x = 1\n') // no stars in code
    await page.keyboard.press(`${mod}+b`)
    await expect(tree(page)).toBeVisible()

    await tree(page).getByRole('treeitem').filter({ hasText: 'notes.md' }).click()
    await expect.poll(() => editorText(page)).toBe('notes\n')
    await editor(page).click()
    await page.keyboard.press(`${mod}+End`)
    await page.keyboard.press(`${mod}+b`)
    await expect.poll(() => editorText(page)).toBe('notes\n****')
    await expect(tree(page)).toBeVisible() // the sidebar stayed
  })
})
