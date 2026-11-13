// Translation: every word Plumb shows comes from its message catalog
// (src/locales/en.json), so it can be translated. In the pseudo-language
// "en-XA" each message is accented and wrapped in ⟦…⟧ (see src/i18n.js);
// visible text without those brackets wasn't extracted. See TESTING.md.
import { test, expect } from '@playwright/test'
import { editor, mod, pick, useFakeDisk, writeFile } from './helpers.js'

const PREFS = 'editor.prefs.v1'

// Words that are rightly the same in every language: the brand, keys,
// encodings and line endings, and the names of fonts and languages.
const NAMES = new Set([
  'Plumb', 'UTF', 'LE', 'BE', 'BOM', 'Windows', 'LF', 'CRLF', 'CR', 'Vim', 'Aa', 'ab', 'Ctrl', 'Shift', 'Alt', 'Esc', 'PageUp',
  'PageDown', 'Enter', 'Tab', 'Space', 'Click', 'Drag', 'JetBrains', 'Mono', 'Fira', 'Code', 'Cascadia', 'SF', 'Menlo',
  'Consolas', 'Source', 'Pro', 'Courier', 'New',
  'AM', 'PM', // in dates formatted for the locale (the pseudo-language formats as English)
])

// Text on screen and in titles, labels and placeholders that has letters
// outside ⟦…⟧, apart from what the user typed and the names above.
async function untranslated(page) {
  return page.evaluate((names) => {
    const allowed = new Set(names)
    // Where the user's own text is shown: documents, file names, the editor.
    const USER = [
      '.cm-editor', '.markdown', '.tab-name', '.tree-name', '.tree-row', '.doc-link strong', '.quick-name', '.quick-folder mark',
      '.search-preview', '.search-file-head strong', '.search-folder', '.name', 'h1.sr-only', 'select.language option:not([value="auto"])',
      '.history-view', '.label-chip', '.folder-name', 'kbd', '.font-sample', '.close-files',
      // Formatted by the browser for the locale (Intl.RelativeTimeFormat), so translated already.
      '.history-when',
    ].join(',')
    const bad = (text) => {
      const rest = text.replace(/⟦[^⟧]*⟧/g, ' ')
      return (rest.match(/[A-Za-z]{2,}/g) ?? []).some((w) => !allowed.has(w))
    }
    const visible = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
    const out = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement
      if (!el || el.closest(USER) || el.closest('script, style') || !visible(el)) continue
      if (bad(n.textContent)) out.push(n.textContent.trim())
    }
    for (const el of document.body.querySelectorAll('[title], [aria-label], [placeholder]')) {
      if (el.closest(USER) && !el.matches('.tab-close, .name')) continue
      for (const attr of ['title', 'aria-label', 'placeholder']) {
        const v = el.getAttribute(attr)
        // Titles that are a file's name or path are the user's.
        if (v && bad(v) && !(attr === 'title' && el.matches('.tree-row, .tab, .folder-path, .root-row, [title^="Doc"]'))) out.push(`${attr}: ${v}`)
      }
    }
    return out
  }, [...NAMES])
}

// Choose the pseudo-language (from here on, before the app loads, so the page
// being left can't write its preferences back over it) and reload.
async function usePseudo(page) {
  await page.addInitScript((key) => {
    const prefs = JSON.parse(localStorage.getItem(key) ?? '{}')
    localStorage.setItem(key, JSON.stringify({ ...prefs, language: 'en-XA' }))
  }, PREFS)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-XA')
}

test('the first visit is all translatable', async ({ page }) => {
  await page.goto('./')
  await usePseudo(page)
  await expect(page.locator('.welcome')).toBeVisible()
  expect(await untranslated(page)).toEqual([])
})

test('every screen is translatable', async ({ page }) => {
  await useFakeDisk(page)
  await page.goto('./')
  // (Before opening a folder: reloading after that closes the test browser.)
  await usePseudo(page)
  // Something on every screen. Buttons by their place, as their names are pseudo-English.
  await writeFile(page, 'project/README.md', '# Project\n\nSome text\n')
  await writeFile(page, 'project/notes.txt', 'Some notes\n')
  const home = () => page.locator('.brand').click()
  const newDoc = () => page.locator('.actions button.primary').click()
  for (const text of ['# A heading\n\nSome text, and more text.', 'To delete']) {
    await newDoc()
    await editor(page).click()
    await page.keyboard.type(text)
    await home()
  }
  await page.locator('.doc-list li', { hasText: 'To delete' }).locator('button.danger').click()
  await pick(page, 'project')
  await page.locator('.actions button').nth(2).click() // Open folder…
  await expect(page.locator('.file-tree')).toBeVisible()
  const seen = {}
  const check = async (screen) => (seen[screen] = await untranslated(page))

  // The start page, with drafts, the Trash and the folder sidebar.
  await page.locator('.trash-head button.link').click()
  await check('home')

  // The editor: a Markdown draft with its preview, the find bar with
  // replace, history, the split, the status bar's details.
  await page.locator('.doc-link').first().click()
  await expect(editor(page)).toBeVisible()
  await page.locator('.toolbar button.toggle[aria-pressed]').nth(2).click() // Preview
  await check('editor')
  await editor(page).click()
  await page.keyboard.press(`${mod}+h`)
  await page.keyboard.type('text')
  await check('find and replace')
  await page.keyboard.press('Escape')
  await page.keyboard.press(`${mod}+g`)
  await check('go to line')
  await page.keyboard.press('Escape')
  await page.locator('.toolbar button.toggle[aria-pressed]').nth(3).click() // History
  await expect(page.locator('.history')).toBeVisible()
  await check('history')
  await page.locator('.history-head button.icon').click()
  await page.keyboard.press(`${mod}+\\`)
  await expect(page.locator('.split-pane')).toBeVisible()
  await check('split')
  await page.keyboard.press(`${mod}+\\`)
  await page.locator('.indent-menu > button').click()
  await check('indentation menu')
  await page.keyboard.press('Escape')

  // Dialogs: shortcuts, the quick switcher, the command palette, headings.
  await page.keyboard.press('F1')
  await check('shortcuts')
  await page.keyboard.press('Escape')
  await page.keyboard.press(`${mod}+p`)
  await check('quick switcher')
  await page.keyboard.press('Escape')
  await page.keyboard.press(`${mod}+Shift+p`)
  await check('command palette')
  await page.locator('.quick-input').fill('#')
  await check('headings')
  await page.keyboard.press('Escape')

  // Settings, and Search with results and replace.
  await page.goto('./#/settings')
  await check('settings')
  await page.goto('./#/search')
  await page.locator('.search-form input[type="search"]').fill('text')
  await expect(page.locator('.search-file').first()).toBeVisible()
  await page.locator('.search-form button.icon').first().click() // show replace
  await check('search')

  expect(Object.fromEntries(Object.entries(seen).filter(([, words]) => words.length))).toEqual({})
})

test('the language can be changed in Settings, and applies at once', async ({ page }) => {
  await page.goto('./#/settings')
  const language = page.getByRole('combobox', { name: 'Language' })
  await expect(language.locator('option').first()).toHaveText(/^Same as the browser \(English\)$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  // The pseudo-language is offered once chosen (it's for testing).
  await usePseudo(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^⟦/)
  await page.locator('select').first().selectOption('en')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})
