// Draws the app's bitmap icons from the SVG sources, using Playwright's
// Chromium (installed for the end-to-end tests). Run it after changing an
// icon: `npm run icons`.
//
//   public/icon.svg                  -> icons/icon-192.png, icons/icon-512.png
//   build/icons/icon-full-bleed.svg  -> icons/maskable-512.png, icons/apple-touch-icon.png
//   public/favicon.svg               -> favicon.ico (16, 32 and 48 px)
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root))
const write = (path, data) => writeFileSync(new URL(path, root), data)

// A .ico file holding PNG images (supported by every current browser and OS).
export function icoFromPngs(images) {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i
    header.writeUInt8(size >= 256 ? 0 : size, entry)
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1)
    header.writeUInt16LE(1, entry + 4) // colour planes
    header.writeUInt16LE(32, entry + 6) // bits per pixel
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...images.map((i) => i.png)])
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  async function render(svgPath, size, { opaque = false } = {}) {
    const src = 'data:image/svg+xml;base64,' + read(svgPath).toString('base64')
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}img{display:block}</style><img src="${src}" width="${size}" height="${size}">`,
    )
    await page.locator('img').evaluate((img) => img.decode())
    return page.screenshot({ omitBackground: !opaque, clip: { x: 0, y: 0, width: size, height: size } })
  }

  write('public/icons/icon-192.png', await render('public/icon.svg', 192))
  write('public/icons/icon-512.png', await render('public/icon.svg', 512))
  write('public/icons/maskable-512.png', await render('build/icons/icon-full-bleed.svg', 512, { opaque: true }))
  write('public/icons/apple-touch-icon.png', await render('build/icons/icon-full-bleed.svg', 180, { opaque: true }))
  const sizes = [16, 32, 48]
  const pngs = []
  for (const size of sizes) pngs.push({ size, png: await render('public/favicon.svg', size) })
  write('public/favicon.ico', icoFromPngs(pngs))
  await browser.close()
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
