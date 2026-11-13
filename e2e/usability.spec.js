// Finding and using things: the first visit, hit targets, the page outline,
// features that used to be keyboard-only, closing a tab with unsaved file
// changes, and narrow and touch screens. See CHANGELOG.md (Unreleased).
import { test, expect, devices } from '@playwright/test'
import { editor, editorText, expectSaved, mod, newDocument, openFromDisk, toEnd, useFakeDisk, writeFile } from './helpers.js'

test('a first visit explains files and drafts, without the storage warning', async ({ page }) => {
  await page.goto('./')
  const welcome = page.getByRole('heading', { name: 'Welcome to Plumb' })
  await expect(welcome).toBeVisible()
  await expect(page.getByText('Files stay on your disk.')).toBeVisible()
  await expect(page.locator('.storage-info')).toHaveCount(0)

  await page.getByRole('button', { name: 'New document' }).click()
  await page.keyboard.type('a note')
  await expectSaved(page)
  await page.getByRole('link', { name: /Plumb/ }).click()
  await expect(welcome).toHaveCount(0)
  await expect(page.locator('.storage-info')).toBeVisible()
})

test('each screen has a top-level heading', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await newDocument(page)
  await page.keyboard.type('Shopping list')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Shopping list/)
})

test('the open documents are links, the current one marked, each with its own close button', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('first')
  const nav = page.getByRole('navigation', { name: 'Open documents' })
  await expect(nav.getByRole('link', { name: /^first/ })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('button', { name: /^Close first/ })).toBeVisible()
  // No control inside another (a close button inside a "tab").
  expect(await nav.locator('a button, button a, [role="tab"]').count()).toBe(0)
})

test('the small controls are at least 24 by 24 pixels', async ({ page }) => {
  await newDocument(page)
  const sizes = await page.locator('footer.status button:visible, footer.status select:visible, .tab-close').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect()
      return { name: e.title || e.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) }
    }),
  )
  expect(sizes.length).toBeGreaterThan(4)
  expect(sizes.filter((s) => s.w < 24 || s.h < 24)).toEqual([])
})

test('the text size buttons are named by what they do', async ({ page }) => {
  await newDocument(page)
  const bigger = page.getByRole('button', { name: 'Larger text' })
  await expect(bigger).toBeVisible()
  await expect(bigger).not.toHaveAttribute('aria-label')
})

test('Split has a button, which shows whether the split is open', async ({ page }) => {
  await newDocument(page)
  const split = page.getByRole('button', { name: 'Split', exact: true })
  await expect(split).toHaveAttribute('aria-pressed', 'false')
  await split.click()
  await expect(split).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.pane .cm-editor')).toHaveCount(2)
  await split.click()
  await expect(split).toHaveAttribute('aria-pressed', 'false')
})

test('the command palette lists the commands run lately first', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.press(`${mod}+Shift+P`)
  await page.keyboard.type('toggle word wrap')
  await page.keyboard.press('Enter')
  await editor(page).click()
  await page.keyboard.press(`${mod}+Shift+P`)
  const first = page.getByRole('dialog', { name: 'Run a command' }).getByRole('option').first()
  await expect(first).toContainText('Toggle word wrap')
  await expect(first).toContainText('Recently used')
})

test.describe('with files on disk', () => {
  test.beforeEach(async ({ page }) => {
    await useFakeDisk(page)
    await page.goto('./')
  })

  test('closing the tab of a file with unsaved changes says they are kept, and Reopen brings it back', async ({ page }) => {
    await writeFile(page, 'todo.txt', 'one\n')
    await openFromDisk(page, 'todo.txt')
    await toEnd(page)
    await page.keyboard.type('two')
    await expectSaved(page)
    await page.getByRole('button', { name: 'Close todo.txt' }).click()
    const toast = page.locator('.toast')
    await expect(toast).toContainText('“todo.txt” has changes not saved to the file. They’re kept in this browser.')
    await toast.getByRole('button', { name: 'Reopen' }).click()
    await expect.poll(() => editorText(page)).toBe('one\ntwo')
  })
})

test.describe('on a phone', () => {
  // A phone's screen and touch (the device's browser type is left to the config).
  const phone = { ...devices['Pixel 5'] }
  delete phone.defaultBrowserType
  test.use(phone)

  test('the toolbar keeps the everyday buttons; the rest are in More', async ({ page }) => {
    await newDocument(page)
    await page.keyboard.type('# Title\n\ntext')
    for (const name of ['Preview', 'Find', 'Save']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    for (const name of ['Wrap', 'History', 'Print', 'Split']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)

    const more = page.getByRole('button', { name: 'More', exact: true })
    await more.click()
    const menu = page.getByRole('menu', { name: 'More' })
    await expect(menu.getByRole('menuitemcheckbox', { name: 'Wrap long lines' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitemcheckbox', { name: 'Underline spelling mistakes' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(more).toBeFocused()

    await more.click()
    await menu.getByRole('menuitemcheckbox', { name: 'History' }).click()
    await expect(page.locator('.history')).toBeVisible()
    // Every menu item fits on screen.
    await more.click()
    const box = await menu.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width)
  })

  test('Bold and Italic buttons format Markdown without a keyboard', async ({ page }) => {
    await newDocument(page)
    await page.keyboard.type('word')
    await page.keyboard.press('Shift+Home')
    await page.getByRole('button', { name: 'Bold' }).click()
    await expect.poll(() => editorText(page)).toBe('**word**')
    await page.getByRole('button', { name: 'Italic' }).click()
    await expect.poll(() => editorText(page)).toBe('***word***')
    await expect(editor(page)).toBeFocused()
  })

  test('the status bar folds its controls behind a details button', async ({ page }) => {
    await newDocument(page)
    const encoding = page.getByRole('combobox', { name: 'Encoding used when downloading' })
    await expect(encoding).toBeHidden()
    await page.getByRole('button', { name: 'Show details' }).click()
    await expect(encoding).toBeVisible()
    await page.getByRole('button', { name: 'Hide details' }).click()
    await expect(encoding).toBeHidden()
  })
})
