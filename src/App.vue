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
import { t } from './i18n'
import { keyLabel } from './keys'

// Drop files anywhere in the app to open them.
const router = useRouter()
const route = useRoute()
const quickOpen = ref(null)

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
    showToast(t('app.updateReady'), {
      action: { label: t('app.reload'), run: applyUpdate },
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
    showToast(t('tree.reloaded', { name: displayName(doc.name) }), { timeout: 2500 })
  }
})
const onVisible = () => document.visibilityState === 'visible' && checkOpenDocs()
// The reassurance in the header. For a file on disk it mustn't say
// "saved": only Save writes the file; the browser keeps the edits until then.
const savedHint = computed(() => {
  const doc = route.name === 'edit' ? getDoc(route.params.id) : null
  const key = doc?.linked ? 'app.keptUntilSave' : 'app.allSaved'
  return t(pwa.offline ? `${key}Offline` : key, { key: keyLabel('Mod+S') })
})
const showSidebar = computed(() => prefs.sidebar && prefs.workspaces.length > 0 && canOpenFolder())
async function onOpenFolder() {
  try {
    await openFolder()
  } catch (e) {
    showToast(t('app.cantOpenFolder', { error: e.message }))
  }
}

// Commands available everywhere (the editor adds its own while open).
registerCommands([
  {
    id: 'newDocument', get title() { return t('commands.titles.newDocument') }, group: 'documents',
    run: () => {
      const doc = createDoc()
      requestPersistence()
      router.push({ name: 'edit', params: { id: doc.id } })
    },
  },
  { id: 'goToDocument', get title() { return t('commands.titles.goToDocument') }, group: 'documents', shortcut: 'quickOpen', run: () => quickOpen.value.show() },
  // In a Markdown document: its headings in the quick switcher ("#").
  { id: 'goToHeading', get title() { return t('commands.titles.goToHeading') }, group: 'editor', when: () => (ui.headings?.() ?? []).length > 0, run: () => quickOpen.value.show('#') },
  { id: 'allDocuments', get title() { return t('commands.titles.allDocuments') }, group: 'documents', run: () => router.push({ name: 'home' }) },
  { id: 'settings', get title() { return t('commands.titles.settings') }, group: 'settings', shortcut: 'settings', run: () => router.push({ name: 'settings' }) },
  { id: 'searchAll', get title() { return t('commands.titles.searchAll') }, group: 'documents', shortcut: 'searchAll', run: openSearch },
  { id: 'saveAll', get title() { return t('commands.titles.saveAll') }, group: 'files', shortcut: 'saveAll', when: () => unsavedToDisk().length > 0, run: saveAll },
  { id: 'openFolder', get title() { return t('commands.titles.openFolder') }, group: 'files', when: canOpenFolder, run: onOpenFolder },
  {
    id: 'toggleSidebar', get title() { return t('commands.titles.toggleSidebar') }, group: 'files', shortcut: 'sidebar',
    when: () => prefs.workspaces.length > 0, run: () => (prefs.sidebar = !prefs.sidebar),
  },
  { id: 'refreshFolders', get title() { return t('commands.titles.refreshFolders') }, group: 'files', when: () => prefs.workspaces.length > 0, run: () => forgetListings() },
  { id: 'exportBackup', get title() { return t('commands.titles.exportBackup') }, group: 'documents', run: downloadBackup },
  { id: 'shortcuts', get title() { return t('commands.titles.shortcuts') }, group: 'help', shortcut: 'shortcuts', run: () => (ui.shortcutsOpen = true) },
  { id: 'install', get title() { return t('commands.titles.install') }, group: 'help', when: () => pwa.canInstall, run: install },
  { id: 'update', get title() { return t('commands.titles.update') }, group: 'help', when: () => pwa.updateReady, run: applyUpdate },
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
      <button v-if="pwa.canInstall" class="quick-button" :title="t('app.installTitle')" @click="install">
        {{ t('app.install') }}
      </button>
      <button
        v-if="prefs.workspaces.length && canOpenFolder()"
        class="quick-button"
        :aria-pressed="!!prefs.sidebar"
        :title="t('app.foldersTitle', { key: keyLabel('Mod+Shift+E') })"
        @click="prefs.sidebar = !prefs.sidebar"
      >
        {{ t('app.folders') }}
      </button>
      <button class="quick-button" :title="t('app.searchTitle', { key: keyLabel('Mod+Shift+F') })" @click="openSearch">
        {{ t('app.search') }}
      </button>
      <button class="quick-button" :title="t('app.goToTitle', { key: keyLabel('Mod+P') })" @click="quickOpen.show()">
        {{ t('app.goTo') }} <kbd>{{ keyLabel('Mod+P') }}</kbd>
      </button>
      <button class="quick-button help-button" :title="t('app.settingsTitle', { key: keyLabel('Mod+,') })" :aria-label="t('app.settings')" @click="router.push({ name: 'settings' })">
        ⚙
      </button>
      <button class="quick-button help-button" :title="t('app.shortcutsTitle')" :aria-label="t('shortcuts.title')" @click="ui.shortcutsOpen = true">
        ?
      </button>
    </span>
  </header>
  <main>
    <FileTree v-if="showSidebar" />
    <div class="view"><RouterView /></div>
  </main>
  <div v-if="dragging" class="drop-overlay" aria-hidden="true">
    <div>{{ t('app.drop') }}</div>
  </div>
  <QuickOpen ref="quickOpen" />
  <ShortcutsDialog v-if="ui.shortcutsOpen" @close="ui.shortcutsOpen = false" />
  <AppToast />
</template>
