// Vite plugin: writes sw.js into the finished build, listing every file in
// it (index.html, scripts, styles, icons, the manifest) so the service worker
// can download the whole app at install time. It runs after everything else
// is written, so nothing is missed. The version is a hash of the file names
// (which change when their contents do) and of index.html.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

function listFiles(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? listFiles(path, base) : [relative(base, path).split('\\').join('/')]
  })
}

export function serviceWorkerSource(files, indexHtml, template) {
  const hash = createHash('sha256')
  for (const f of files) hash.update(f + '\n')
  hash.update(indexHtml)
  return template
    .replace('__VERSION__', JSON.stringify(hash.digest('hex').slice(0, 12)))
    .replace('__FILES__', JSON.stringify(files, null, 1))
}

export default function pwa() {
  let outDir
  return {
    name: 'editor-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const files = listFiles(outDir).filter((f) => f !== 'sw.js').sort()
      const template = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8')
      const source = serviceWorkerSource(files, readFileSync(join(outDir, 'index.html')), template)
      writeFileSync(join(outDir, 'sw.js'), source)
    },
  }
}
