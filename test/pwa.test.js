import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { serviceWorkerSource } from '../build/pwa.js'

const template = readFileSync(new URL('../build/sw-template.js', import.meta.url), 'utf8')
const version = (src) => /const VERSION = "(\w+)"/.exec(src)[1]

test('the service worker lists the files and gets a version that changes with them', () => {
  const a = serviceWorkerSource(['assets/a-1.js', 'index.html'], '<html>1</html>', template)
  assert.match(a, /"assets\/a-1\.js"/)
  assert.ok(!a.includes('__FILES__') && !a.includes('__VERSION__'))
  assert.equal(version(a), version(serviceWorkerSource(['assets/a-1.js', 'index.html'], '<html>1</html>', template)), 'same build, same version')
  assert.notEqual(version(a), version(serviceWorkerSource(['assets/a-2.js', 'index.html'], '<html>1</html>', template)))
  assert.notEqual(version(a), version(serviceWorkerSource(['assets/a-1.js', 'index.html'], '<html>2</html>', template)))
})

test('the manifest is installable: name, start URL, display mode, icons incl. maskable', () => {
  const m = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'))
  assert.ok(m.name && m.short_name && m.start_url && m.display === 'standalone')
  const sizes = m.icons.map((i) => i.sizes)
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'))
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'))
  assert.ok(m.file_handlers[0].accept['text/plain'].includes('.txt'))
})

test('favicon.ico holds the 16, 32 and 48 px PNGs, and icoFromPngs writes a valid header', async () => {
  const { icoFromPngs } = await import('../build/icons.js')
  const png = (n) => Buffer.from([0x89, 0x50, 0x4e, 0x47, n])
  const ico = icoFromPngs([{ size: 16, png: png(1) }, { size: 256, png: png(2) }])
  assert.equal(ico.readUInt16LE(2), 1, 'icon type')
  assert.equal(ico.readUInt16LE(4), 2, 'two images')
  assert.equal(ico[6], 16)
  assert.equal(ico[6 + 16], 0, '256 px is written as 0')
  assert.deepEqual(ico.subarray(ico.readUInt32LE(6 + 12), ico.readUInt32LE(6 + 12) + 5), png(1))
  assert.deepEqual(ico.subarray(ico.readUInt32LE(22 + 12)), png(2))

  const real = readFileSync(new URL('../public/favicon.ico', import.meta.url))
  const sizes = Array.from({ length: real.readUInt16LE(4) }, (_, i) => real[6 + 16 * i])
  assert.deepEqual(sizes, [16, 32, 48])
})

test('index.html links the favicon files that exist in public/', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  for (const [, href] of html.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="\/([^"]+)"/g)) {
    assert.ok(readFileSync(new URL('../public/' + href, import.meta.url)).length > 0, href)
  }
})
