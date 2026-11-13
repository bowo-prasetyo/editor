// Takes the README's screenshots, docs/screenshots/plumb-{light,dark}.png, from
// the production build: a folder open in the sidebar, a Markdown file with its
// preview, and a second file with changes not yet saved (the brass dot).
// Run `npm run screenshots` after a visible change to the interface.
//
// The folder is made on the same stand-in disk the end-to-end tests use (see
// e2e/helpers.js), so nothing on your computer is read or written.
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'
import { preview } from 'vite'
import { dismissToast, pick, useFakeDisk, writeFile } from '../e2e/helpers.js'

const root = new URL('../', import.meta.url)

const FILES = {
  'garden-log/README.md': `# Garden log

Notes from the allotment, kept as plain text files.

## This week

- Sowed **broad beans**, two rows by the fence
- Moved the tomatoes into the greenhouse
- Fixed the shed door, *finally*

## Next week

1. Thin out the carrots
2. Net the strawberries before the birds find them
3. Order seed potatoes

> Plain files outlive every app.
`,
  'garden-log/notes/2026-spring.md': '# Spring\n\nFirst frost-free night on 12 April.\n',
  'garden-log/notes/harvest.csv': 'date,crop,kg\n2026-07-02,courgettes,1.4\n',
  'garden-log/scripts/water.js': `// Remind me to water when it hasn't rained for three days.
export function needsWater(days) {
  const dry = days.slice(-3).every((d) => d.rainMm < 1)
  return dry
}
`,
  'garden-log/plot.yaml': 'beds: 6\npath: gravel\n',
}

const SIZE = { width: 1440, height: 680 }

async function shoot(baseURL, scheme, out) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ baseURL, colorScheme: scheme, viewport: SIZE, deviceScaleFactor: 1.25 })
  const page = await context.newPage()
  await useFakeDisk(page)
  await page.goto('./')
  for (const [path, text] of Object.entries(FILES)) await writeFile(page, path, text)
  await pick(page, 'garden-log')
  await page.getByRole('button', { name: 'Open folder…' }).click()
  const tree = page.getByRole('tree', { name: 'Files' })
  const row = (name) => tree.getByRole('treeitem').filter({ has: page.locator('.tree-name').getByText(name, { exact: true }) }).first()

  // A code file with an unsaved edit: its tab and row get the brass dot.
  await row('scripts').click()
  await row('water.js').click()
  const editor = page.locator('.cm-content').first()
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\n// TODO: skip watering after a storm')
  await row('notes').click()

  // The Markdown file, with its preview beside it.
  await row('README.md').click()
  await page.getByRole('button', { name: 'Preview' }).click()
  await page.locator('.markdown h1').waitFor()
  await page.locator('.cm-content').first().click()
  await page.keyboard.press('Control+Home')
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('End')
  await dismissToast(page)
  await page.mouse.move(0, SIZE.height - 1)
  await page.waitForTimeout(400)
  await page.screenshot({ path: out })
  await browser.close()
}

const server = await preview({ root: new URL('.', root).pathname, preview: { port: 0, open: false } })
try {
  const baseURL = server.resolvedUrls.local[0]
  mkdirSync(new URL('docs/screenshots/', root), { recursive: true })
  for (const scheme of ['light', 'dark']) {
    await shoot(baseURL, scheme, new URL(`docs/screenshots/plumb-${scheme}.png`, root).pathname)
  }
} finally {
  await server.close()
}
