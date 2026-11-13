// Documents kept by an earlier version of Plumb (before files and drafts
// were kept apart) are brought up to date once. See src/migrate.js and
// docs/files-and-drafts.md, "Migration".
import { test, expect } from '@playwright/test'

// Put documents into storage as an earlier version left them, then reload.
async function seed(page, docs) {
  await page.goto('./')
  await expect(page.getByRole('button', { name: 'New document' })).toBeVisible()
  await page.evaluate(async (docs) => {
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open('editor')
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('docs', 'readwrite')
      for (const d of docs) tx.objectStore('docs').put(d)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    const prefs = JSON.parse(localStorage.getItem('editor.prefs.v1') ?? '{}')
    delete prefs.schema
    localStorage.setItem('editor.prefs.v1', JSON.stringify(prefs))
  }, docs)
  await page.reload()
}

const old = (id, name, content, extra = {}) => ({ id, name, content, createdAt: 1, updatedAt: 1, ...extra })
const fromClosedFolder = (extra = {}) => ({ linked: true, source: { root: 'closed', path: 'src/x.js' }, folder: 'old-app/src', ...extra })

test('old documents become drafts; copies of files from closed folders are offered to the Trash', async ({ page }) => {
  await seed(page, [
    old('a', 'notes.txt', 'my notes'),
    old('b', 'x.js', 'unsaved edit', fromClosedFolder({ diskDirty: true })),
    old('c', 'y.js', 'just a copy', fromClosedFolder()),
    old('d', 'z.js', 'another copy', fromClosedFolder()),
  ])
  const list = page.locator('.list-pane')
  for (const name of ['notes.txt', 'x.js', 'y.js', 'z.js']) await expect(list).toContainText(name)

  const banner = page.getByRole('status').filter({ hasText: /from (a folder|folders) you closed/ })
  await expect(banner).toContainText('2 drafts are copies')
  await banner.getByRole('button', { name: 'Move them to the Trash' }).click()
  await expect(banner).toBeHidden()
  await expect(list).not.toContainText('y.js')
  await expect(list).toContainText('x.js') // unsaved edits are never offered
  await expect(list).toContainText('notes.txt')

  // Undo brings them back, as ordinary drafts.
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click()
  await expect(list).toContainText('y.js')
  await expect(banner).toBeHidden()

  // It ran once: a reload changes nothing.
  await page.reload()
  await expect(list).toContainText('y.js')
  await expect(page.getByRole('status').filter({ hasText: /from (a folder|folders) you closed/ })).toHaveCount(0)
})

test('Keep them turns copies into ordinary drafts for good', async ({ page }) => {
  await seed(page, [old('c', 'y.js', 'just a copy', fromClosedFolder())])
  const banner = page.getByRole('status').filter({ hasText: /from (a folder|folders) you closed/ })
  await expect(banner).toContainText('1 draft is a copy')
  await banner.getByRole('button', { name: 'Keep them' }).click()
  await expect(banner).toBeHidden()
  await page.reload()
  await expect(page.locator('.list-pane')).toContainText('y.js')
  await expect(banner).toHaveCount(0)
})
