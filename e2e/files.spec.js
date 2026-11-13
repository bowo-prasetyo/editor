// Saving to files on disk: faithful round trips and never overwriting
// changes made elsewhere without asking. VISION.md principles 1 and 2.
import { test, expect } from '@playwright/test'
import {
  editor,
  editorText,
  expectSaved,
  fileStatus,
  mod,
  newDocument,
  openFromDisk,
  pick,
  readBytes,
  readText,
  saveToFile,
  tick,
  toEnd,
  useFakeDisk,
  writeFile,
} from './helpers.js'

test.beforeEach(async ({ page }) => {
  await useFakeDisk(page)
  await page.goto('./')
})

const bytes = (s, enc = 'utf8') => [...Buffer.from(s, enc)]
const utf16be = (s) => {
  const le = Buffer.from(s, 'utf16le')
  for (let i = 0; i < le.length; i += 2) [le[i], le[i + 1]] = [le[i + 1], le[i]]
  return [...le]
}

// Each file is opened and saved with no edits: the bytes must not change.
const ROUND_TRIPS = {
  'UTF-8, LF': bytes('one\ntwo\n'),
  'UTF-8, no final newline': bytes('one\ntwo'),
  'UTF-8 with BOM, CRLF': [0xef, 0xbb, 0xbf, ...bytes('one\r\ntwo\r\n')],
  'UTF-8, CR (classic Mac)': bytes('one\rtwo\r'),
  'UTF-8, non-ASCII': bytes('café ✓ 日本語 🙂\n'),
  'UTF-16 LE with BOM, CRLF': [0xff, 0xfe, ...bytes('one\r\ntwo ✓\r\n', 'utf16le')],
  'UTF-16 BE with BOM, LF': [0xfe, 0xff, ...utf16be('one\ntwo ✓\n')],
  'Windows-1252, CRLF': [...bytes('caf'), 0xe9, ...bytes(' na'), 0xef, ...bytes('ve\r\n')],
  'Trailing spaces and tabs': bytes('keep  \n\tthese\t\n'),
  'Empty file': [],
}

for (const [name, original] of Object.entries(ROUND_TRIPS)) {
  test(`saving without changes keeps the file byte for byte: ${name}`, async ({ page }) => {
    await writeFile(page, 'file.txt', original)
    await openFromDisk(page, 'file.txt')
    await saveToFile(page)
    expect(await readBytes(page, 'file.txt')).toEqual(original)
  })
}

// Files that mix line endings (see src/lineends.js).
const MIXED = bytes('one\r\ntwo\nthree\r\nfour\r\n')
const lineEndings = (page) => page.getByRole('combobox', { name: 'Line endings used when downloading' })

test('saving without changes keeps the file byte for byte: mixed line endings', async ({ page }) => {
  await writeFile(page, 'mixed.txt', MIXED)
  await openFromDisk(page, 'mixed.txt')
  await expect(lineEndings(page)).toHaveValue('mixed')
  await saveToFile(page)
  expect(await readBytes(page, 'mixed.txt')).toEqual(MIXED)
})

test('in a file with mixed line endings, untouched lines keep theirs and new lines get the main one', async ({ page }) => {
  await writeFile(page, 'mixed.txt', MIXED)
  await openFromDisk(page, 'mixed.txt')
  await editor(page).click()
  await page.keyboard.press(`${mod}+Home`)
  await page.keyboard.press('ArrowDown') // line "two" (LF)
  await page.keyboard.press('End')
  await page.keyboard.type(' edited')
  await page.keyboard.press('Enter')
  await page.keyboard.type('new line')
  await saveToFile(page)
  expect(await readText(page, 'mixed.txt')).toBe('one\r\ntwo edited\nnew line\r\nthree\r\nfour\r\n')

  // And again, from what was just written.
  await toEnd(page)
  await page.keyboard.type('five')
  await saveToFile(page)
  expect(await readText(page, 'mixed.txt')).toBe('one\r\ntwo edited\nnew line\r\nthree\r\nfour\r\nfive')
})

test('choosing one line ending converts a mixed file', async ({ page }) => {
  await writeFile(page, 'mixed.txt', MIXED)
  await openFromDisk(page, 'mixed.txt')
  await lineEndings(page).selectOption({ label: 'LF' })
  await expect(lineEndings(page)).toHaveValue('\n')
  await expect(lineEndings(page).locator('option', { hasText: 'Mixed' })).toHaveCount(0)
  await saveToFile(page)
  expect(await readText(page, 'mixed.txt')).toBe('one\ntwo\nthree\nfour\n')
})

test('a change to only the line endings on disk is taken, not undone by the next save', async ({ page }) => {
  await writeFile(page, 'crlf.txt', 'a\r\nb\r\n')
  await openFromDisk(page, 'crlf.txt')
  await tick(page)
  await writeFile(page, 'crlf.txt', 'a\nb\n') // e.g. dos2unix
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(lineEndings(page)).toHaveValue('\n')
  await toEnd(page)
  await page.keyboard.type('c')
  await saveToFile(page)
  expect(await readText(page, 'crlf.txt')).toBe('a\nb\nc')
})

test('an edit is written in the file’s own encoding and line endings', async ({ page }) => {
  await writeFile(page, 'notes.txt', [0xff, 0xfe, ...bytes('first\r\nsecond', 'utf16le')])
  await openFromDisk(page, 'notes.txt')
  await toEnd(page)
  await page.keyboard.press('Enter')
  await page.keyboard.type('third ✓')
  await expect(fileStatus(page)).toHaveText('Not saved to file')
  await saveToFile(page)
  expect(await readBytes(page, 'notes.txt')).toEqual([0xff, 0xfe, ...bytes('first\r\nsecond\r\nthird ✓', 'utf16le')])
})

test('a file changed on disk is not overwritten without asking', async ({ page }) => {
  await writeFile(page, 'shared.txt', 'original\n')
  await openFromDisk(page, 'shared.txt')
  await toEnd(page)
  await page.keyboard.type('mine')
  await tick(page)
  await writeFile(page, 'shared.txt', 'theirs\n')

  // Say no: the other program's text stays on disk, ours stays in the editor.
  let asked = ''
  page.once('dialog', (d) => ((asked = d.message()), d.dismiss()))
  await editor(page).click()
  await page.keyboard.press(`${mod}+s`)
  await expect.poll(() => asked).toContain('changed on disk')
  expect(await readText(page, 'shared.txt')).toBe('theirs\n')
  expect(await editorText(page)).toBe('original\nmine')
  await expect(fileStatus(page)).toHaveText('Not saved to file')

  // Say yes: ours replaces it.
  page.once('dialog', (d) => d.accept())
  await saveToFile(page)
  expect(await readText(page, 'shared.txt')).toBe('original\nmine')
})

test('Save on a new document asks where, then keeps saving there', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('a new file')
  await expectSaved(page)
  await pick(page, 'new.txt')
  await page.keyboard.press(`${mod}+s`)
  await expect(page.locator('.toast')).toContainText('Saved to “new.txt”')
  await expect(fileStatus(page)).toHaveText('Saved to file')
  expect(await readText(page, 'new.txt')).toBe('a new file')
  await expect(page.getByRole('textbox', { name: 'File name' })).toHaveValue('new.txt')

  // The next Save goes to the same file without asking.
  await page.keyboard.type(', saved twice')
  await saveToFile(page)
  expect(await readText(page, 'new.txt')).toBe('a new file, saved twice')
})

test('Save as writes a copy and links the document to it', async ({ page }) => {
  await writeFile(page, 'a.txt', 'text\n')
  await openFromDisk(page, 'a.txt')
  await pick(page, 'b.txt')
  await page.getByRole('button', { name: 'Save as…' }).click()
  await expect(page.locator('.toast')).toContainText('Saved to “b.txt”')
  await expect(page.getByRole('textbox', { name: 'File name' })).toHaveValue('b.txt')
  expect(await readText(page, 'b.txt')).toBe('text\n')

  await toEnd(page)
  await page.keyboard.type('more')
  await saveToFile(page)
  expect(await readText(page, 'b.txt')).toBe('text\nmore')
  expect(await readText(page, 'a.txt')).toBe('text\n')
})

test('cancelling the save picker writes nothing and keeps the text', async ({ page }) => {
  await newDocument(page)
  await page.keyboard.type('not yet')
  await expectSaved(page)
  await page.keyboard.press(`${mod}+s`) // no pick(): the picker is cancelled
  await expect(page.locator('.toast')).toHaveCount(0)
  expect(await editorText(page)).toBe('not yet')
  await expectSaved(page)
})
