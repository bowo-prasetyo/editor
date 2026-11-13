// A folder opened from disk: browse it, edit a file, save it back, follow
// changes made by other programs. VISION.md, "The product model".
import { test, expect } from '@playwright/test'
import { editorText, expectSaved, fileStatus, readText, saveToFile, tick, toEnd, pick, useFakeDisk, writeFile } from './helpers.js'

const tree = (page) => page.getByRole('tree', { name: 'Files' })
// A row of the tree by file name (its accessible name also has the "●" for unsaved changes).
const item = (page, name) =>
  tree(page).getByRole('treeitem').filter({ has: page.locator('.tree-name').getByText(name, { exact: true }) })

test.beforeEach(async ({ page }) => {
  await useFakeDisk(page)
  await page.goto('./')
  await writeFile(page, 'project/README.md', '# Project\n')
  await writeFile(page, 'project/src/app.js', 'const answer = 41\n')
  await pick(page, 'project')
  await page.getByRole('button', { name: 'Open folder…' }).click()
  await expect(item(page, 'project')).toBeVisible()
})

test('a file in the folder opens, and Save writes it back', async ({ page }) => {
  await expect(item(page, 'README.md')).toBeVisible()
  await item(page, 'src').click()
  await item(page, 'app.js').click()
  await expect.poll(() => editorText(page)).toBe('const answer = 41\n')

  await toEnd(page)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('End')
  await page.keyboard.press('Backspace')
  await page.keyboard.type('2')
  await expect(fileStatus(page)).toHaveText('Not saved to file')
  await expect(item(page, 'app.js')).toContainText('●')
  await saveToFile(page)
  expect(await readText(page, 'project/src/app.js')).toBe('const answer = 42\n')
  await expect(item(page, 'app.js')).not.toContainText('●')
})

test('opening the same file again shows the same document', async ({ page }) => {
  await item(page, 'README.md').click()
  await toEnd(page)
  await page.keyboard.type('draft line')
  await expectSaved(page)
  await item(page, 'src').click()
  await item(page, 'app.js').click()
  await expect.poll(() => editorText(page)).toBe('const answer = 41\n')
  await item(page, 'README.md').click()
  await expect.poll(() => editorText(page)).toBe('# Project\ndraft line')
})

test('a file changed by another program is picked up', async ({ page }) => {
  await item(page, 'README.md').click()
  await expect.poll(() => editorText(page)).toBe('# Project\n')
  await tick(page)
  await writeFile(page, 'project/README.md', '# Project\n\nUpdated elsewhere.\n')
  // The folder is watched; coming back to the window checks too.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => editorText(page)).toBe('# Project\n\nUpdated elsewhere.\n')
})

test('a file added on disk appears in the tree after refreshing', async ({ page }) => {
  await writeFile(page, 'project/NOTES.txt', 'new\n')
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(item(page, 'NOTES.txt')).toBeVisible()
})

// --- Files and drafts (docs/files-and-drafts.md) -------------------------------------

// Back to the start page without reloading. (A reload with a folder open
// reads its handle back from IndexedDB, which crashes this headless browser
// for handles from its private file system: see TESTING.md, "Not covered".)
const goHome = (page) => page.getByRole('link', { name: /Plumb/ }).click()

// The document records kept in IndexedDB, as stored.
const storedDocs = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('editor')
        open.onsuccess = () => {
          const req = open.result.transaction('docs').objectStore('docs').getAll()
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        }
        open.onerror = () => reject(open.error)
      }),
  )

test('a file from a folder is not a draft: it stays out of the Drafts list', async ({ page }) => {
  await item(page, 'README.md').click()
  await expect.poll(() => editorText(page)).toBe('# Project\n')
  await goHome(page)
  await expect(page.locator('.list-pane')).toContainText('No drafts yet')
  await expect(page.locator('.list-pane')).not.toContainText('README.md')
})

test('a file with nothing unsaved is stored without its text; unsaved edits are stored', async ({ page }) => {
  await item(page, 'README.md').click()
  await expect.poll(() => editorText(page)).toBe('# Project\n')
  await expectSaved(page)
  let rec = (await storedDocs(page)).find((d) => d.name === 'README.md')
  expect(rec.kind).toBe('file')
  expect(rec.content).toBe('')

  await toEnd(page)
  await page.keyboard.type('unsaved')
  await expectSaved(page)
  rec = (await storedDocs(page)).find((d) => d.name === 'README.md')
  expect(rec.content).toBe('# Project\nunsaved')
})

test('search reads files from disk, not stored copies', async ({ page }) => {
  await item(page, 'README.md').click()
  await expect.poll(() => editorText(page)).toBe('# Project\n')
  await expectSaved(page)
  await writeFile(page, 'project/README.md', '# Project\n\nbanana\n')
  await page.goto('./#/search?q=banana')
  await expect(page.locator('.search-page')).toContainText('README.md')
})

test('closing a folder keeps unsaved files as drafts; the others go', async ({ page }) => {
  await item(page, 'README.md').click()
  await toEnd(page)
  await page.keyboard.type('keep this')
  await expectSaved(page)
  await item(page, 'src').click()
  await item(page, 'app.js').click()
  await expect.poll(() => editorText(page)).toBe('const answer = 41\n')

  await page.getByRole('button', { name: 'Close project' }).click()
  await expect(page.locator('.toast')).toContainText('1 file with unsaved changes was kept as a draft')
  await goHome(page)
  const list = page.locator('.list-pane')
  await expect(list).toContainText('README.md')
  await expect(list).not.toContainText('app.js')
  await list.getByText('README.md').click()
  await expect.poll(() => editorText(page)).toBe('# Project\nkeep this')
})
