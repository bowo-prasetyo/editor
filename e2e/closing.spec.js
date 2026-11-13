// Closing a folder with unsaved files, and opening it again (src/closing.js).
// See docs/files-and-drafts.md, "Closing a folder".
import { test, expect } from '@playwright/test'
import { editorText, expectSaved, fileStatus, pick, readText, saveToFile, toEnd, useFakeDisk, writeFile, tick } from './helpers.js'

const tree = (page) => page.getByRole('tree', { name: 'Files' })
// The sidebar: the folder's trees, and its notes and buttons around them.
const sidebar = (page) => page.getByRole('navigation', { name: 'Folders on disk' })
const item = (page, name) =>
  tree(page)
    .getByRole('treeitem')
    // Its own name: a folder's item also holds the rows inside it.
    .filter({ has: page.locator(':scope > .tree-name, :scope > .root-row > .tree-name').getByText(name, { exact: true }) })
const dialog = (page) => page.getByRole('dialog', { name: 'Close project' })

// From the start page (reached without a reload: see TESTING.md, "Not covered").
async function openProject(page) {
  await page.getByRole('link', { name: /Plumb/ }).click()
  await pick(page, 'project')
  await page.getByRole('button', { name: /Open folder/ }).first().click()
  await expect(item(page, 'project')).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await useFakeDisk(page)
  await page.goto('./')
  await writeFile(page, 'project/README.md', '# Project\n')
  await writeFile(page, 'project/notes.txt', 'notes\n')
  await openProject(page)
  // Edit README.md, leaving it unsaved.
  await item(page, 'README.md').click()
  await expect.poll(() => editorText(page)).toBe('# Project\n')
  await toEnd(page)
  await page.keyboard.type('edited')
  await expectSaved(page)
})

test('closing a folder with nothing unsaved just closes it', async ({ page }) => {
  await saveToFile(page)
  await page.getByRole('button', { name: 'Close project' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.locator('.toast')).toContainText('Closed “project”.')
  await expect(tree(page)).toHaveCount(0)
})

test('the close dialog lists the unsaved files; Cancel leaves the folder open', async ({ page }) => {
  await page.getByRole('button', { name: 'Close project' }).click()
  await expect(dialog(page)).toContainText('“project” has 1 file with unsaved changes')
  await expect(dialog(page)).toContainText('README.md')
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(item(page, 'project')).toBeVisible()
  await expect(fileStatus(page)).toHaveText('Not saved to file')
})

test('Save all to disk writes the files, then closes the folder', async ({ page }) => {
  await page.getByRole('button', { name: 'Close project' }).click()
  await dialog(page).getByRole('button', { name: 'Save all to disk' }).click()
  await expect(page.locator('.toast')).toContainText('Saved 1 file and closed “project”.')
  await expect(tree(page)).toHaveCount(0)
  expect(await readText(page, 'project/README.md')).toBe('# Project\nedited')
})

test('if a file can’t be saved, the folder stays open and says which', async ({ page }) => {
  await tick(page)
  await writeFile(page, 'project/README.md', '# changed elsewhere\n')
  page.once('dialog', (d) => d.dismiss()) // "changed on disk: replace it?" No.
  await page.getByRole('button', { name: 'Close project' }).click()
  await dialog(page).getByRole('button', { name: 'Save all to disk' }).click()
  await expect(page.locator('.toast')).toContainText('“project” is still open: “README.md” wasn’t saved.')
  await expect(item(page, 'project')).toBeVisible()
  expect(await readText(page, 'project/README.md')).toBe('# changed elsewhere\n')
})

test('Keep as drafts, open the folder again, and put the edits back', async ({ page }) => {
  await page.getByRole('button', { name: 'Close project' }).click()
  await dialog(page).getByRole('button', { name: 'Keep as drafts' }).click()
  await expect(page.locator('.toast')).toContainText('open the folder again to put the edits back')
  await expect(tree(page)).toHaveCount(0)

  await page.getByRole('link', { name: /Plumb/ }).click()
  await expect(page.locator('.list-pane')).toContainText('README.md')
  await openProject(page)
  const offer = sidebar(page).getByRole('status').filter({ hasText: 'edits to files in “project”' })
  await expect(offer).toContainText('1 draft has edits')
  await offer.getByRole('button', { name: 'Put the edits back' }).click()
  await expect(page.locator('.toast')).toContainText('Put back the edits to 1 file.')
  await expect(offer).toHaveCount(0)
  await expect(item(page, 'README.md')).toContainText('●') // unsaved, as before
  await expect(page.locator('.list-pane')).not.toContainText('README.md') // a file again, not a draft

  await item(page, 'README.md').click()
  await expect.poll(() => editorText(page)).toBe('# Project\nedited')
  await saveToFile(page)
  expect(await readText(page, 'project/README.md')).toBe('# Project\nedited')
})

test('a file changed while the folder was closed comes back with the “changed on disk” banner', async ({ page }) => {
  await page.getByRole('button', { name: 'Close project' }).click()
  await dialog(page).getByRole('button', { name: 'Keep as drafts' }).click()
  await tick(page)
  await writeFile(page, 'project/README.md', '# changed while closed\n')
  await openProject(page)
  await sidebar(page).getByRole('button', { name: 'Put the edits back' }).click()
  await expect(page.locator('.toast')).toContainText('changed on disk meanwhile')

  await item(page, 'README.md').click()
  await expect.poll(() => editorText(page)).toBe('# Project\nedited') // nothing replaced
  await expect(page.getByRole('alert').filter({ hasText: 'changed on disk' })).toBeVisible()
})

test('Not now leaves the drafts as drafts', async ({ page }) => {
  await page.getByRole('button', { name: 'Close project' }).click()
  await dialog(page).getByRole('button', { name: 'Keep as drafts' }).click()
  await openProject(page)
  await sidebar(page).getByRole('button', { name: 'Not now' }).click()
  await expect(sidebar(page).getByRole('button', { name: 'Put the edits back' })).toHaveCount(0)
  await page.getByRole('link', { name: /Plumb/ }).click()
  await expect(page.locator('.list-pane')).toContainText('README.md')
})
