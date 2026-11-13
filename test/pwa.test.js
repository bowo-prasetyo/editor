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
