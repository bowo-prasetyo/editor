<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { prefs } from './prefs'
import { NONE } from './folders'
import AppToast from './components/AppToast.vue'
import QuickOpen from './components/QuickOpen.vue'
import ShortcutsDialog from './components/ShortcutsDialog.vue'
import FileTree from './components/FileTree.vue'
import { canOpenFolder, forgetListings, loadWorkspaces, openFolder } from './workspace'
import { saveAll } from './saveall'
import { unsavedToDisk } from './fileaccess'
import { registerCommands, ui } from './commands'
import { createDoc, downloadBackup, requestPersistence } from './store'
import { applyUpdate, initPwa, install, pwa } from './pwa'
import { showToast } from './toast'
import { openFiles } from './openFiles'
import { droppedHandles } from './fileaccess'

// Drop files anywhere in the app to open them.
const router = useRouter()
const route = useRoute()
// Files dropped on the document list go into the folder it shows.
const dropFolder = () => (route.name === 'home' && prefs.folderView !== NONE ? prefs.folderView : '')
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
  // Ctrl/Cmd+Alt+S: save every changed file.
  if (mod && e.altKey && !e.shiftKey && e.code === 'KeyS') {
    e.preventDefault()
    return saveAll()
  }
  // Ctrl/Cmd+B: show or hide the folder sidebar.
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b' && prefs.workspaces.length) {
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
    showToast('A new version of the editor is ready.', {
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
    id: 'newDocument', title: 'New document', group: 'Documents',
    run: () => {
      const doc = createDoc()
      requestPersistence()
      router.push({ name: 'edit', params: { id: doc.id } })
    },
  },
  { id: 'goToDocument', title: 'Go to document…', group: 'Documents', shortcut: 'quickOpen', run: () => quickOpen.value.show() },
  { id: 'allDocuments', title: 'Show all documents', group: 'Documents', run: () => router.push({ name: 'home' }) },
  { id: 'searchAll', title: 'Search in all documents and folders', group: 'Documents', shortcut: 'searchAll', run: openSearch },
  { id: 'saveAll', title: 'Save all changed files', group: 'Files', shortcut: 'saveAll', when: () => unsavedToDisk().length > 0, run: saveAll },
  { id: 'openFolder', title: 'Open folder…', group: 'Files', when: canOpenFolder, run: onOpenFolder },
  {
    id: 'toggleSidebar', title: 'Show or hide the folder sidebar', group: 'Files', shortcut: 'sidebar',
    when: () => prefs.workspaces.length > 0, run: () => (prefs.sidebar = !prefs.sidebar),
  },
  { id: 'refreshFolders', title: 'Read folders from disk again', group: 'Files', when: () => prefs.workspaces.length > 0, run: () => forgetListings() },
  { id: 'exportBackup', title: 'Export all documents as a backup', group: 'Documents', run: downloadBackup },
  { id: 'shortcuts', title: 'Show keyboard shortcuts', group: 'Help', shortcut: 'shortcuts', run: () => (ui.shortcutsOpen = true) },
  { id: 'install', title: 'Install the editor as an app', group: 'Help', when: () => pwa.canInstall, run: install },
  { id: 'update', title: 'Reload to use the new version', group: 'Help', when: () => pwa.updateReady, run: applyUpdate },
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
  if (!handles) return openFiles(files, router, { folder: dropFolder() })
  handles.then((hs) =>
    openFiles(
      files.map((file, i) => ({ file, handle: hs[i]?.kind === 'file' ? hs[i] : null })),
      router,
      { folder: dropFolder() },
    ),
  )
}

const events = { dragenter: onDragEnter, dragleave: onDragLeave, dragover: onDragOver, drop: onDrop, keydown: onKey }
onMounted(() => Object.entries(events).forEach(([k, f]) => window.addEventListener(k, f)))
onBeforeUnmount(() => Object.entries(events).forEach(([k, f]) => window.removeEventListener(k, f)))
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="brand">📝 Editor</RouterLink>
    <span class="topbar-right">
      <span class="hint">{{ pwa.offline ? 'Offline · everything is saved in your browser' : 'Everything is saved in your browser' }}</span>
      <button v-if="pwa.canInstall" class="quick-button" title="Install the editor as an app that works offline" @click="install">
        Install
      </button>
      <button class="quick-button" :title="`Search in all documents and folders (${isMac ? '⌘⇧F' : 'Ctrl+Shift+F'})`" @click="openSearch">
        Search
      </button>
      <button class="quick-button" :title="`Go to a document (${isMac ? '⌘' : 'Ctrl+'}P)`" @click="quickOpen.show()">
        Go to… <kbd>{{ isMac ? '⌘P' : 'Ctrl+P' }}</kbd>
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
