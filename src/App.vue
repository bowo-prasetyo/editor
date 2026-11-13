<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { prefs } from './prefs'
import AppToast from './components/AppToast.vue'
import QuickOpen from './components/QuickOpen.vue'
import ShortcutsDialog from './components/ShortcutsDialog.vue'
import FileTree from './components/FileTree.vue'
import { canOpenFolder, forgetListings, loadWorkspaces, openFolder } from './workspace'
import { saveAll } from './saveall'
import { checkOpenDocs, setReloadedHandler, startLiveReload } from './livereload'
import { displayName } from './naming'
import { unsavedToDisk } from './fileaccess'
import { registerCommands, ui } from './commands'
import { createDoc, downloadBackup, getDoc, requestPersistence } from './store'
import { applyUpdate, initPwa, install, pwa } from './pwa'
import { showToast } from './toast'
import { openFiles } from './openFiles'
import { droppedHandles } from './fileaccess'

// Drop files anywhere in the app to open them.
const router = useRouter()
const route = useRoute()
const quickOpen = ref(null)
const isMac = /Mac|iPhone|iPad/.test(navigator.platform)

// F1 anywhere, or "?" when not typing, shows the keyboard shortcuts.
const typing = (el) => el?.closest?.('input, textarea, select, [contenteditable="true"], .cm-editor')
// Ctrl/Cmd+Shift+F: search everywhere, starting with the editor's selection
// (if it's a short piece of one line).
function openSearch() {
  const sel = ui.selectedText?.() ?? ''
  const q = sel && sel.length <= 200 && !sel.includes('\n') ? sel : ''
  router.push({ name: 'search', query: q ? { q } : {} })
}

function onKey(e) {
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.shiftKey && !e.altKey && e.code === 'KeyF') {
    e.preventDefault()
    return openSearch()
  }
  // Ctrl/Cmd+,: settings.
  if (mod && !e.altKey && !e.shiftKey && e.key === ',') {
    e.preventDefault()
    return router.push({ name: 'settings' })
  }
  // Ctrl/Cmd+Alt+S: save every changed file.
  if (mod && e.altKey && !e.shiftKey && e.code === 'KeyS') {
    e.preventDefault()
    return saveAll()
  }
  // Ctrl/Cmd+Shift+E: show or hide the folder sidebar, everywhere (as in
  // VS Code's Explorer).
  if (mod && e.shiftKey && !e.altKey && e.code === 'KeyE' && prefs.workspaces.length) {
    e.preventDefault()
    prefs.sidebar = !prefs.sidebar
    return
  }
  // Ctrl/Cmd+B does too, as before, but only outside Markdown documents,
  // where the editor takes it first for bold (markdownKeys in cm.js).
  if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b' && !e.defaultPrevented && prefs.workspaces.length) {
    e.preventDefault()
    prefs.sidebar = !prefs.sidebar
    return
  }
  if (e.key === 'F1' || (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target))) {
    e.preventDefault()
    ui.shortcutsOpen = !ui.shortcutsOpen
  }
}

// Offline app: install button, update prompt, and files opened from the
// operating system ("Open with" the installed app; save in place works).
initPwa({
  onUpdate: () =>
    showToast('A new version of Plumb is ready.', {
      action: { label: 'Reload', run: applyUpdate },
      timeout: 60 * 60 * 1000,
    }),
})
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async ({ files }) => {
    if (!files?.length) return
    const entries = await Promise.all(files.map(async (handle) => ({ file: await handle.getFile(), handle })))
    openFiles(entries, router)
  })
}

// Folders opened from disk, shown in the sidebar (Chrome, Edge).
loadWorkspaces()

// Live reload: documents follow changes to their files on disk (see
// livereload.js). Files are checked again when the window comes back.
startLiveReload()
setReloadedHandler((doc) => {
  if (route.name === 'edit' && route.params.id === doc?.id) {
    showToast(`Reloaded “${displayName(doc.name)}”: it changed on disk.`, { timeout: 2500 })
  }
})
const onVisible = () => document.visibilityState === 'visible' && checkOpenDocs()
// The reassurance in the header. For a file on disk it mustn't say
// "saved": only Save writes the file; the browser keeps the edits until then.
const savedHint = computed(() => {
  const doc = route.name === 'edit' ? getDoc(route.params.id) : null
  const text = doc?.linked
    ? `Edits are kept in your browser until you save them (${isMac ? '⌘S' : 'Ctrl+S'})`
    : 'Everything is saved in your browser'
  return pwa.offline ? `Offline · ${text[0].toLowerCase()}${text.slice(1)}` : text
})
const showSidebar = computed(() => prefs.sidebar && prefs.workspaces.length > 0 && canOpenFolder())
async function onOpenFolder() {
  try {
    await openFolder()
  } catch (e) {
    showToast(`Couldn't open the folder: ${e.message}`)
  }
}

// Commands available everywhere (the editor adds its own while open).
registerCommands([
  {
    id: 'newDocument', title: 'New document', group: 'documents',
    run: () => {
      const doc = createDoc()
      requestPersistence()
      router.push({ name: 'edit', params: { id: doc.id } })
    },
  },
  { id: 'goToDocument', title: 'Go to document…', group: 'documents', shortcut: 'quickOpen', run: () => quickOpen.value.show() },
  // In a Markdown document: its headings in the quick switcher ("#").
  { id: 'goToHeading', title: 'Go to heading…', group: 'editor', when: () => (ui.headings?.() ?? []).length > 0, run: () => quickOpen.value.show('#') },
  { id: 'allDocuments', title: 'Show all documents', group: 'documents', run: () => router.push({ name: 'home' }) },
  { id: 'settings', title: 'Open settings', group: 'settings', shortcut: 'settings', run: () => router.push({ name: 'settings' }) },
  { id: 'searchAll', title: 'Search in all documents and folders', group: 'documents', shortcut: 'searchAll', run: openSearch },
  { id: 'saveAll', title: 'Save all changed files', group: 'files', shortcut: 'saveAll', when: () => unsavedToDisk().length > 0, run: saveAll },
  { id: 'openFolder', title: 'Open folder…', group: 'files', when: canOpenFolder, run: onOpenFolder },
  {
    id: 'toggleSidebar', title: 'Show or hide the folder sidebar', group: 'files', shortcut: 'sidebar',
    when: () => prefs.workspaces.length > 0, run: () => (prefs.sidebar = !prefs.sidebar),
  },
  { id: 'refreshFolders', title: 'Read folders from disk again', group: 'files', when: () => prefs.workspaces.length > 0, run: () => forgetListings() },
  { id: 'exportBackup', title: 'Export all documents as a backup', group: 'documents', run: downloadBackup },
  { id: 'shortcuts', title: 'Show keyboard shortcuts', group: 'help', shortcut: 'shortcuts', run: () => (ui.shortcutsOpen = true) },
  { id: 'install', title: 'Install Plumb as an app', group: 'help', when: () => pwa.canInstall, run: install },
  { id: 'update', title: 'Reload to use the new version', group: 'help', when: () => pwa.updateReady, run: applyUpdate },
])
const dragging = ref(false)
let depth = 0
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files')

function onDragEnter(e) {
  if (!hasFiles(e)) return
  depth++
  dragging.value = true
}
function onDragLeave(e) {
  if (!hasFiles(e)) return
  depth = Math.max(0, depth - 1)
  if (!depth) dragging.value = false
}
function onDragOver(e) {
  if (hasFiles(e)) e.preventDefault()
}
function onDrop(e) {
  if (!hasFiles(e)) return
  e.preventDefault()
  depth = 0
  dragging.value = false
  const files = [...e.dataTransfer.files]
  // Handles (where offered) let Save write back to the dropped files. They
  // must be requested now, before the drop event is over.
  const handles = droppedHandles(e.dataTransfer)
  if (!handles) return openFiles(files, router)
  handles.then((hs) =>
    openFiles(
      files.map((file, i) => ({ file, handle: hs[i]?.kind === 'file' ? hs[i] : null })),
      router,
    ),
  )
}

const events = { dragenter: onDragEnter, dragleave: onDragLeave, dragover: onDragOver, drop: onDrop, keydown: onKey }
onMounted(() => {
  Object.entries(events).forEach(([k, f]) => window.addEventListener(k, f))
  window.addEventListener('focus', checkOpenDocs)
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  Object.entries(events).forEach(([k, f]) => window.removeEventListener(k, f))
  window.removeEventListener('focus', checkOpenDocs)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="brand">
      <!-- The favicon's mark (public/favicon.svg): the text cursor as a plumb line. -->
      <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="brand-tile" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#1f6fe0" />
            <stop offset="1" stop-color="#0b3a8c" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="url(#brand-tile)" />
        <rect x="28.5" y="7" width="7" height="27" rx="3.5" fill="#fff" />
        <path d="M32 30c8 0 12 4.5 12 10 0 6-5 10.5-12 18-7-7.5-12-12-12-18 0-5.5 4-10 12-10z" fill="#f5c04a" />
        <path d="M32 30c8 0 12 4.5 12 10 0 6-5 10.5-12 18z" fill="#dd9d2c" />
      </svg>
      Plumb
    </RouterLink>
    <span class="topbar-right">
      <span class="hint">{{ savedHint }}</span>
      <button v-if="pwa.canInstall" class="quick-button" title="Install Plumb as an app that works offline" @click="install">
        Install
      </button>
      <button
        v-if="prefs.workspaces.length && canOpenFolder()"
        class="quick-button"
        :aria-pressed="!!prefs.sidebar"
        :title="`Show or hide the folder sidebar (${isMac ? '⌘⇧E' : 'Ctrl+Shift+E'})`"
        @click="prefs.sidebar = !prefs.sidebar"
      >
        Folders
      </button>
      <button class="quick-button" :title="`Search in all documents and folders (${isMac ? '⌘⇧F' : 'Ctrl+Shift+F'})`" @click="openSearch">
        Search
      </button>
      <button class="quick-button" :title="`Go to a document (${isMac ? '⌘' : 'Ctrl+'}P)`" @click="quickOpen.show()">
        Go to… <kbd>{{ isMac ? '⌘P' : 'Ctrl+P' }}</kbd>
      </button>
      <button class="quick-button help-button" :title="`Settings (${isMac ? '⌘,' : 'Ctrl+,'})`" aria-label="Settings" @click="router.push({ name: 'settings' })">
        ⚙
      </button>
      <button class="quick-button help-button" title="Keyboard shortcuts (F1)" aria-label="Keyboard shortcuts" @click="ui.shortcutsOpen = true">
        ?
      </button>
    </span>
  </header>
  <main>
    <FileTree v-if="showSidebar" />
    <div class="view"><RouterView /></div>
  </main>
  <div v-if="dragging" class="drop-overlay" aria-hidden="true">
    <div>Drop files to open them</div>
  </div>
  <QuickOpen ref="quickOpen" />
  <ShortcutsDialog v-if="ui.shortcutsOpen" @close="ui.shortcutsOpen = false" />
  <AppToast />
</template>
