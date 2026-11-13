// Files opened on their own: Recent files on the start page (src/recent.js).
// See docs/files-and-drafts.md.
import { test, expect } from '@playwright/test'
import { editor, editorText, expectSaved, mod, newDocument, openFromDisk, pick, readText, toEnd, useFakeDisk, writeFile, tick } from './helpers.js'

const home = (page) => page.getByRole('link', { name: /Plumb/ }).click()
const recentList = (page) => page.getByRole('region', { name: 'Recent files' })
const drafts = (page) => page.locator('.list-pane > .doc-list')

test.beforeEach(async ({ page }) => {
  await useFakeDisk(page)
  await page.goto('./')
})

test('a file opened on its own is in Recent files, not among the drafts', async ({ page }) => {
  await writeFile(page, 'notes.txt', 'hello\n')
  await openFromDisk(page, 'notes.txt')
  await home(page)
  await expect(recentList(page)).toContainText('notes.txt')
  await expect(page.locator('.list-pane')).toContainText('No drafts yet')
})

test('opening the same file again shows the same one, with what’s on disk now', async ({ page }) => {
  await writeFile(page, 'notes.txt', 'one\n')
  await openFromDisk(page, 'notes.txt')
  await home(page)
  await tick(page)
  await writeFile(page, 'notes.txt', 'two\n')
  await pick(page, ['notes.txt'])
  await page.getByRole('button', { name: 'Open files…' }).click()
  await expect.poll(() => editorText(page)).toBe('two\n')
  await home(page)
  await expect(recentList(page).locator('li')).toHaveCount(1)
})

test('a file with unsaved changes says so, and can’t be taken off the list', async ({ page }) => {
  await writeFile(page, 'a.txt', 'a\n')
  await openFromDisk(page, 'a.txt')
  await toEnd(page)
  await page.keyboard.type('edit')
  await expectSaved(page)
  await home(page)
  const row = recentList(page).locator('li').filter({ hasText: 'a.txt' })
  await expect(row).toContainText('Not saved to file')
  await expect(row.getByRole('button', { name: /Remove a.txt/ })).toHaveCount(0)
})

test('taking a file off the list leaves the file on disk', async ({ page }) => {
  await writeFile(page, 'a.txt', 'a\n')
  await openFromDisk(page, 'a.txt')
  await home(page)
  await recentList(page).getByRole('button', { name: 'Remove a.txt from Recent files' }).click()
  await expect(page.locator('.toast')).toContainText('The file is still on your disk.')
  await expect(recentList(page)).toHaveCount(0)
  expect(await readText(page, 'a.txt')).toBe('a\n')
})

test('a draft saved to a file becomes that file: it moves to Recent files', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('my notes')
  await expectSaved(page)
  await pick(page, 'saved.txt')
  await editor(page).click()
  await page.keyboard.press(`${mod}+s`)
  await expect(page.locator('.toast')).toContainText('Saved to “saved.txt”')
  await home(page)
  await expect(recentList(page)).toContainText('saved.txt')
  await expect(drafts(page)).toHaveCount(0)
})

test('single files kept as drafts by an earlier version move to Recent files', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'New document' })).toBeVisible()
  await page.evaluate(async () => {
    const db = await new Promise((r) => { const o = indexedDB.open('editor'); o.onsuccess = () => r(o.result) })
    await new Promise((r) => {
      const tx = db.transaction('docs', 'readwrite')
      tx.objectStore('docs').put({ id: 's1', kind: 'draft', name: 'report.txt', content: 'r', linked: true, createdAt: 1, updatedAt: 5 })
      tx.objectStore('docs').put({ id: 'd1', kind: 'draft', name: 'idea.txt', content: 'i', createdAt: 1, updatedAt: 4 })
      tx.oncomplete = r
    })
    const prefs = JSON.parse(localStorage.getItem('editor.prefs.v1') ?? '{}')
    prefs.schema = 2
    localStorage.setItem('editor.prefs.v1', JSON.stringify(prefs))
  })
  await page.reload()
  await expect(recentList(page)).toContainText('report.txt')
  await expect(drafts(page)).toContainText('idea.txt')
  await expect(drafts(page)).not.toContainText('report.txt')
})
