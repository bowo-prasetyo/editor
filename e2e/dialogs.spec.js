// Modal dialogs (src/modal.js): the page behind a dialog can't be reached
// from the keyboard, Escape closes the dialog wherever focus is, and focus
// goes back where it was. Keys meant for a dialog must never edit the
// document behind it.
import { test, expect } from '@playwright/test'
import { editor, editorText, mod, newDocument } from './helpers.js'

const shortcuts = (page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' })
const inDialog = (page) => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))

test('Tab stays in the shortcuts dialog and never types into the document', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('text')
  await page.keyboard.press('F1')
  await expect(shortcuts(page)).toBeVisible()

  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    expect(await inDialog(page)).toBe(true)
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab')
    expect(await inDialog(page)).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(shortcuts(page)).toHaveCount(0)
  expect(await editorText(page)).toBe('text')

  // Focus is back in the editor: typing carries on where it was.
  await page.keyboard.type('!')
  await expect.poll(() => editorText(page)).toBe('text!')
})

test('Escape closes a dialog even when focus was moved out of it', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.press('F1')
  await expect(shortcuts(page)).toBeVisible()
  // A script (or anything else) focusing the page behind: focus is brought back.
  await page.evaluate(() => document.querySelector('.cm-content').focus())
  expect(await inDialog(page)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(shortcuts(page)).toHaveCount(0)
})

test('closing a dialog opened from a button puts focus back on the button', async ({ page }) => {
  await page.goto('./')
  const help = page.getByRole('button', { name: 'Keyboard shortcuts' })
  await help.focus()
  await page.keyboard.press('Enter')
  await expect(shortcuts(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(shortcuts(page)).toHaveCount(0)
  await expect(help).toBeFocused()
})

test('the quick switcher keeps focus, and Escape returns it to the editor', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('abc')
  await page.keyboard.press(`${mod}+p`)
  const quick = page.getByRole('dialog', { name: 'Go to document' })
  await expect(quick).toBeVisible()
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab')
    expect(await inDialog(page)).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(quick).toHaveCount(0)
  await expect(editor(page)).toBeFocused()
  expect(await editorText(page)).toBe('abc')
})
