// Drafts: pinning, read-only labels, and "Save to folder…". See
// docs/files-and-drafts.md, "Drafts".
import { test, expect } from '@playwright/test'
import { editor, editorText, expectSaved, mod, newDocument, pick, readText, useFakeDisk, writeFile } from './helpers.js'

const list = (page) => page.locator('.list-pane')
const row = (page, name) => list(page).locator('li').filter({ hasText: name })
const home = (page) => page.getByRole('link', { name: /Plumb/ }).click()

async function draft(page, text) {
  await newDocument(page)
  await page.keyboard.type(text)
  await expectSaved(page)
}

// Drafts with labels, as earlier versions of Plumb filed them in folders.
async function seedLabelled(page) {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'New document' })).toBeVisible()
  await page.evaluate(async () => {
    const db = await new Promise((r) => { const o = indexedDB.open('editor'); o.onsuccess = () => r(o.result) })
    await new Promise((r) => {
      const tx = db.transaction('docs', 'readwrite')
      const s = tx.objectStore('docs')
      s.put({ id: 'w1', kind: 'draft', name: 'client.txt', content: 'c', folder: 'Work/Clients', createdAt: 1, updatedAt: 3 })
      s.put({ id: 'w2', kind: 'draft', name: 'invoice.txt', content: 'i', folder: 'Work/Clients', createdAt: 1, updatedAt: 2 })
      s.put({ id: 'p1', kind: 'draft', name: 'poem.txt', content: 'p', createdAt: 1, updatedAt: 1 })
      tx.oncomplete = r
    })
  })
  await page.reload()
}

test('a pinned draft stays at the top, and stays pinned', async ({ page }) => {
  await draft(page, 'alpha')
  await draft(page, 'beta')
  await home(page)
  await expect(list(page).locator('li').first()).toContainText('beta')
  await row(page, 'alpha').getByRole('button', { name: 'Pin alpha.md' }).click()
  await expect(list(page).locator('li').first()).toContainText('alpha')
  await expect(row(page, 'alpha').getByRole('button', { name: 'Unpin alpha.md' })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(list(page).locator('li').first()).toContainText('alpha')
})

test('labels: filter by one, remove one (with Undo); no folders are made any more', async ({ page }) => {
  await seedLabelled(page)
  const labels = page.getByRole('navigation', { name: 'Labels' })
  await expect(labels).toContainText('Work/Clients')
  await expect(page.getByRole('button', { name: /New folder/ })).toHaveCount(0)
  await expect(list(page).getByRole('button', { name: /to a folder/ })).toHaveCount(0)

  await labels.getByRole('button', { name: /Work\/Clients/ }).click()
  await expect(list(page)).toContainText('client.txt')
  await expect(list(page)).not.toContainText('poem.txt')

  await row(page, 'client.txt').getByRole('button', { name: 'Remove the label Work/Clients from client.txt' }).click()
  await expect(row(page, 'client.txt')).toHaveCount(0) // no longer has the label shown
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect(row(page, 'client.txt')).toHaveCount(1)
  await expect(row(page, 'client.txt').locator('.label-chip')).toContainText('Work/Clients')
})

test('the quick switcher makes a plain draft: “Work/todo.md” is todo.md, with no label', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'New document' })).toBeVisible()
  await page.keyboard.press(`${mod}+p`)
  await page.keyboard.type('Work/todo.md')
  await page.keyboard.press('Enter') // nothing matches: Enter creates it
  await expect(page.getByRole('textbox', { name: 'File name' })).toHaveValue('todo.md')
  await home(page)
  await expect(row(page, 'todo.md').locator('.label-chip')).toHaveCount(0)
})

test.describe('Save to folder', () => {
  test.beforeEach(async ({ page }) => {
    await useFakeDisk(page)
    await page.goto('./')
    await writeFile(page, 'project/README.md', '# Project\n')
    await pick(page, 'project')
    await page.getByRole('button', { name: 'Open folder…' }).click()
    await expect(page.getByRole('tree', { name: 'Files' })).toBeVisible()
    await page.getByRole('button', { name: 'New document' }).click()
    await editor(page).click()
    await page.keyboard.type('Plan\nstep one')
    await expectSaved(page)
  })

  const dialog = (page) => page.getByRole('dialog', { name: 'Save to folder' })

  test('the draft becomes a file in the folder, and Undo makes it a draft again', async ({ page }) => {
    await page.getByRole('button', { name: 'Save to folder…' }).click()
    await dialog(page).getByRole('textbox', { name: 'File name' }).fill('notes/plan.md')
    await dialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(page.locator('.toast')).toContainText('Saved as “notes/plan.md” in “project”')
    expect(await readText(page, 'project/notes/plan.md')).toBe('Plan\nstep one')
    await expect(page.getByRole('button', { name: 'Save to folder…' })).toHaveCount(0) // a file now
    await expect(page.locator('.toolbar .folder-path')).toHaveText('project/notes')

    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('.toast')).toContainText('It’s a draft again, and the file was removed.')
    const exists = await page.evaluate(async () => {
      const disk = await (await navigator.storage.getDirectory()).getDirectoryHandle('disk')
      const notes = await (await disk.getDirectoryHandle('project')).getDirectoryHandle('notes')
      try { await notes.getFileHandle('plan.md'); return true } catch { return false }
    })
    expect(exists).toBe(false)
    expect(await editorText(page)).toBe('Plan\nstep one')
    await home(page)
    await expect(list(page)).toContainText('Plan.md')
  })

  test('a file that exists is never replaced: the dialog says so', async ({ page }) => {
    await page.getByRole('button', { name: 'Save to folder…' }).click()
    await dialog(page).getByRole('textbox', { name: 'File name' }).fill('README.md')
    await dialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(dialog(page).getByRole('alert')).toContainText('“README.md” already exists in “project”')
    expect(await readText(page, 'project/README.md')).toBe('# Project\n')
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('button', { name: 'Save to folder…' })).toBeVisible() // still a draft
  })
})
