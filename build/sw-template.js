// Service worker: makes Plumb work offline. Generated at build time
// (see build/pwa.js), which fills in the version and the list of files.
const VERSION = __VERSION__
const FILES = __FILES__ // every built file, relative to this script
const CACHE = `editor-${VERSION}`
const scope = self.registration.scope
const INDEX = new URL('index.html', scope).href

// Install: download the whole app, so it works offline from now on.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(new URL(f, scope), { cache: 'reload' })))),
  )
})

// Activate: drop the files of older versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('editor-') && key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

// The page asks the waiting new version to take over (after the user agrees).
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting()
})

// Pages come from the cache (the app is a single page; routes are in the
// #hash), files too; anything else of ours is fetched and cached on the way.
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    event.respondWith(caches.match(INDEX, { ignoreVary: true }).then((hit) => hit ?? fetch(req)))
    return
  }
  event.respondWith(
    // ignoreVary: servers often send "Vary: Origin", and module scripts are
    // requested with an Origin header that the install-time requests lacked.
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(req, copy))
          }
          return res
        }),
    ),
  )
})
