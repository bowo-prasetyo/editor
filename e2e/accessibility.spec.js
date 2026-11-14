// An automated accessibility scan (axe) of Plumb's screens and dialogs, in
// light and dark. It fails on any "serious" or "critical" finding. See
// TESTING.md, "Accessibility".
import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import { editor, expectSaved, mod } from './helpers.js'

const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

// The serious and critical findings on the page as it is now.
async function scan(page) {
  await page.addScriptTag({ content: AXE })
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ['violations'] })
    return r.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)
  })
}

for (const colorScheme of ['light', 'dark']) {
  test.describe(`in ${colorScheme} mode`, () => {
    test.use({ colorScheme })

    test('the start page, the editor and its find bar, and the quick switcher', async ({ page }) => {
      await page.goto('./')
      await expect(page.locator('.home .actions button.primary')).toBeVisible()
      expect(await scan(page), 'start page').toEqual([])

      await page.locator('.home .actions button.primary').click()
      await editor(page).click()
      await page.keyboard.type('# Notes\n\n- one')
      await expectSaved(page)
      expect(await scan(page), 'editor').toEqual([])

      await page.keyboard.press(`${mod}+h`)
      await expect(page.getByLabel('Find', { exact: true })).toBeVisible()
      expect(await scan(page), 'find and replace').toEqual([])
      await page.keyboard.press('Escape')

      await page.keyboard.press(`${mod}+p`)
      await expect(page.getByRole('dialog')).toBeVisible()
      expect(await scan(page), 'quick switcher').toEqual([])
    })

    test('the keyboard shortcuts, settings, and search', async ({ page }) => {
      await page.goto('./')
      await expect(page.locator('.home .actions button.primary')).toBeVisible()
      await page.keyboard.press('F1')
      await expect(page.getByRole('dialog')).toBeVisible()
      expect(await scan(page), 'keyboard shortcuts').toEqual([])
      await page.keyboard.press('Escape')

      await page.goto('./#/settings')
      await expect(page.locator('.app-version')).toBeVisible()
      expect(await scan(page), 'settings').toEqual([])

      await page.goto('./#/search?q=notes')
      await expect(page.locator('.search-page')).toBeVisible()
      expect(await scan(page), 'search').toEqual([])
    })
  })
}
