// Offline app support: registers the service worker (production builds
// only), offers installing the app where the browser allows it, and tells
// the page when a new version is ready.
import { reactive } from 'vue'

export const pwa = reactive({
  canInstall: false, // the browser offered to install (Chrome, Edge)
  updateReady: false, // a new version is downloaded and waiting
  offline: typeof navigator !== 'undefined' && navigator.onLine === false,
})

let installPrompt = null
let waiting = null
let reloading = false

export function initPwa({ onUpdate } = {}) {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installPrompt = e
    pwa.canInstall = true
  })
  window.addEventListener('appinstalled', () => {
    installPrompt = null
    pwa.canInstall = false
  })
  window.addEventListener('online', () => (pwa.offline = false))
  window.addEventListener('offline', () => (pwa.offline = true))

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      const found = (worker) => {
        if (!worker) return
        const ready = () => {
          // Only an update if a version was already running this page.
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = worker
            pwa.updateReady = true
            onUpdate?.()
          }
        }
        ready()
        worker.addEventListener('statechange', ready)
      }
      found(reg.waiting)
      reg.addEventListener('updatefound', () => found(reg.installing))
      // Look for a new version now and then while the page stays open.
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
    })
    .catch((e) => console.warn('Offline support unavailable', e))

  // Another tab (or this one) switched to the new version: this page's files
  // are now out of date, so reload. Not on the very first install, when the
  // service worker simply starts looking after a page that's already current.
  let controlled = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true // the first install taking over: nothing to reload
      return
    }
    if (reloading) return
    reloading = true
    window.location.reload()
  })
}

export async function install() {
  if (!installPrompt) return false
  installPrompt.prompt()
  const { outcome } = await installPrompt.userChoice
  installPrompt = null
  pwa.canInstall = false
  return outcome === 'accepted'
}

// Switch to the waiting version (all tabs reload; documents are saved first
// by the page's own unload handling).
export function applyUpdate() {
  if (waiting) waiting.postMessage('skipWaiting')
  else window.location.reload()
}
