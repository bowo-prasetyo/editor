<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { prefs } from '../prefs'
import { BinaryFileError, getDoc, state } from '../store'
import { showToast } from '../toast'
import {
  closeFolder,
  createEntry,
  forgetListings,
  getListing,
  isExpanded,
  joinPath,
  loadListing,
  openWorkspaceFile,
  reconnect,
  roots,
  setExpanded,
} from '../workspace'

// The folders opened from disk, as one tree. It's drawn as a flat list of
// rows (folders are read only when expanded), and works like other file
// trees from the keyboard: ↑/↓ move, → expands, ← collapses or goes to the
// parent folder, Enter opens.
const route = useRoute()
const router = useRouter()

// Rows: { key, kind: 'root' | 'directory' | 'file' | 'note', rootId, path,
// name, depth, handle, dir (the folder holding it), dirPath }
const tree = computed(() => {
  const rows = []
  const missing = [] // folders to read: [rootId, path, handle]
  const walk = (rootId, dirPath, dir, depth) => {
    const list = getListing(rootId, dirPath)
    const note = (text) => rows.push({ key: `${rootId}:${dirPath}:note`, kind: 'note', name: text, depth, rootId })
    if (!list) {
      missing.push([rootId, dirPath, dir])
      return note('Loading…')
    }
    if (list.error) return note('Couldn’t read this folder.')
    if (!list.length) return note('Empty')
    for (const handle of list) {
      const path = joinPath(dirPath, handle.name)
      rows.push({ key: `${rootId}:${path}`, kind: handle.kind, rootId, path, name: handle.name, depth, handle, dir, dirPath })
      if (handle.kind === 'directory' && isExpanded(rootId, path)) walk(rootId, path, handle, depth + 1)
    }
  }
  for (const w of prefs.workspaces) {
    const root = roots.get(w.id)
    rows.push({ key: w.id, kind: 'root', rootId: w.id, path: '', name: w.name, depth: 0, handle: root?.handle, root })
    if (root?.permission === 'granted') walk(w.id, '', root.handle, 1)
  }
  return { rows, missing }
})
const rows = computed(() => tree.value.rows)

// Read folders as they come into view.
const reading = new Set()
watch(
  () => tree.value.missing,
  (missing) => {
    for (const [rootId, path, dir] of missing) {
      const key = `${rootId}:${path}`
      if (reading.has(key)) continue
      reading.add(key)
      loadListing(rootId, path, dir).finally(() => reading.delete(key))
    }
  },
  { immediate: true },
)

// The file shown in the editor, and files with changes not saved to disk.
const active = computed(() => {
  const src = route.name === 'edit' ? getDoc(route.params.id)?.source : null
  return src ? `${src.root}:${src.path}` : null
})
const unsaved = computed(
  () => new Set(state.docs.filter((d) => d.source && d.diskDirty && !d.deletedAt).map((d) => `${d.source.root}:${d.source.path}`)),
)

// --- Selection and keyboard --------------------------------------------------------

const selected = ref(null)
const listEl = ref(null)
const focusable = computed(() => rows.value.filter((r) => r.kind !== 'note'))
// The row that takes Tab focus: the selected one, else the active file, else the first.
const tabStop = computed(() => {
  const keys = focusable.value.map((r) => r.key)
  return [selected.value, active.value].find((k) => keys.includes(k)) ?? keys[0]
})

async function select(row, { focus = true } = {}) {
  selected.value = row.key
  if (!focus) return
  await nextTick()
  listEl.value?.querySelector(`[data-key="${CSS.escape(row.key)}"]`)?.focus()
}

function toggle(row, open = !isExpanded(row.rootId, row.path)) {
  if (row.kind === 'directory') setExpanded(row.rootId, row.path, open)
}

function activate(row) {
  select(row, { focus: false })
  if (row.kind === 'directory') toggle(row)
  else if (row.kind === 'file') open(row)
}

function onKey(e) {
  const list = focusable.value
  const i = list.findIndex((r) => r.key === selected.value)
  const row = list[i]
  const go = (j) => list[j] && select(list[j])
  const keys = {
    ArrowDown: () => go(i + 1),
    ArrowUp: () => go(Math.max(0, i - 1)),
    Home: () => go(0),
    End: () => go(list.length - 1),
    ArrowRight: () => {
      if (row?.kind !== 'directory') return
      if (!isExpanded(row.rootId, row.path)) toggle(row, true)
      else go(i + 1)
    },
    ArrowLeft: () => {
      if (!row) return
      if (row.kind === 'directory' && isExpanded(row.rootId, row.path)) return toggle(row, false)
      const parent = row.dirPath ? `${row.rootId}:${row.dirPath}` : row.rootId
      go(list.findIndex((r) => r.key === parent))
    },
    Enter: () => row && activate(row),
    ' ': () => row && activate(row),
  }
  if (!keys[e.key] || e.altKey || e.ctrlKey || e.metaKey) return
  e.preventDefault()
  keys[e.key]()
}

// --- Opening files ------------------------------------------------------------------

async function open(row) {
  try {
    const { doc, refreshed } = await openWorkspaceFile(row.rootId, row.path, row.handle)
    if (refreshed === 'reloaded') showToast(`Reloaded “${row.name}”: it changed on disk.`, { timeout: 4000 })
    if (refreshed === 'conflict') {
      showToast(`“${row.name}” changed on disk, and you have changes not saved to it. Saving will ask before replacing it.`, {
        timeout: 10000,
      })
    }
    router.push({ name: 'edit', params: { id: doc.id } })
  } catch (e) {
    if (e instanceof BinaryFileError) showToast(`Couldn't open “${row.name}”: it doesn't look like a text file.`)
    else if (e?.name === 'NotAllowedError') {
      const root = roots.get(row.rootId)
      if (root) root.permission = 'prompt'
    } else if (e?.name === 'NotFoundError') {
      showToast(`“${row.name}” isn't there any more.`)
      forgetListings(row.rootId)
    } else {
      console.error(e)
      showToast(`Couldn't open “${row.name}”: ${e.message}`)
    }
  }
}

// --- Folder actions --------------------------------------------------------------------

// New files and folders go in the selected folder, or the folder of the
// selected file, in this root.
function targetDir(rootId) {
  const row = rows.value.find((r) => r.key === selected.value && r.rootId === rootId)
  if (row?.kind === 'directory') return { dir: row.handle, path: row.path, expand: row }
  if (row?.kind === 'file') return { dir: row.dir, path: row.dirPath }
  return { dir: roots.get(rootId).handle, path: '' }
}

async function create(rootId, kind) {
  const { dir, path, expand } = targetDir(rootId)
  const where = path ? `in ${path}` : 'at the top of the folder'
  const name = prompt(kind === 'file' ? `New file ${where}:` : `New folder ${where}:`, '')
  if (name === null) return
  try {
    const handle = await createEntry(rootId, dir, path, name, kind)
    if (expand) toggle(expand, true)
    const row = { kind, rootId, path: joinPath(path, handle.name), name: handle.name, handle, dir, dirPath: path }
    row.key = `${rootId}:${row.path}`
    if (kind === 'file') await open(row)
    else select(row)
  } catch (e) {
    showToast(e.message)
  }
}

async function onReconnect(rootId) {
  if (!(await reconnect(rootId))) showToast('The browser didn’t allow access to the folder.')
}

// Files with unsaved changes become drafts, so nothing is lost; the others
// are on disk (see closeFolder).
async function onClose(w) {
  const kept = await closeFolder(w.id)
  showToast(
    kept
      ? `Closed “${w.name}”. ${kept === 1 ? '1 file with unsaved changes was kept as a draft' : `${kept} files with unsaved changes were kept as drafts`}.`
      : `Closed “${w.name}”.`,
    { timeout: kept ? 8000 : 3000 },
  )
}

const refresh = (rootId) => forgetListings(rootId)
</script>

<template>
  <nav class="file-tree" aria-label="Folders on disk">
    <ul ref="listEl" role="tree" aria-label="Files" @keydown="onKey">
      <template v-for="row in rows" :key="row.key">
        <li v-if="row.kind === 'root'" class="tree-root" role="none">
          <div
            role="treeitem"
            :aria-level="1"
            aria-expanded="true"
            :data-key="row.key"
            :tabindex="tabStop === row.key ? 0 : -1"
            @focus="selected = row.key"
            class="tree-row root-row"
            :class="{ selected: selected === row.key }"
            :title="row.name"
            @click="select(row, { focus: false })"
          >
            <span class="tree-name">{{ row.name }}</span>
          </div>
          <span class="root-actions" role="group" :aria-label="`${row.name} actions`">
            <template v-if="row.root?.permission === 'granted'">
              <button class="mini" title="New file" aria-label="New file" @click="create(row.rootId, 'file')">+ File</button>
              <button class="mini" title="New folder" aria-label="New folder" @click="create(row.rootId, 'directory')">+ Folder</button>
              <button class="mini" title="Read the folder again" aria-label="Refresh" @click="refresh(row.rootId)">↻</button>
            </template>
            <button class="mini" :title="`Close ${row.name}`" :aria-label="`Close ${row.name}`" @click="onClose({ id: row.rootId, name: row.name })">×</button>
          </span>
          <p v-if="!row.root" class="tree-note">
            This folder isn’t available in this browser any more. Close it and open it again.
          </p>
          <p v-else-if="row.root.permission !== 'granted'" class="tree-note">
            The browser needs your permission to use this folder again.
            <button class="mini primary-mini" @click="onReconnect(row.rootId)">Allow access</button>
          </p>
        </li>
        <li v-else-if="row.kind === 'note'" role="none" class="tree-note" :style="{ paddingLeft: 8 + row.depth * 14 + 'px' }">
          {{ row.name }}
        </li>
        <li v-else role="none">
          <div
            role="treeitem"
            :aria-level="row.depth + 1"
            :aria-expanded="row.kind === 'directory' ? isExpanded(row.rootId, row.path) : undefined"
            :aria-current="active === row.key ? 'page' : undefined"
            :data-key="row.key"
            :tabindex="tabStop === row.key ? 0 : -1"
            @focus="selected = row.key"
            class="tree-row"
            :class="{ selected: selected === row.key, active: active === row.key, hidden: row.name.startsWith('.') }"
            :style="{ paddingLeft: 8 + (row.depth - 1) * 14 + 'px' }"
            :title="row.path"
            @click="activate(row)"
          >
            <span class="tree-chevron" aria-hidden="true">{{
              row.kind === 'directory' ? (isExpanded(row.rootId, row.path) ? '▾' : '▸') : ''
            }}</span>
            <span class="tree-name">{{ row.name }}</span>
            <span v-if="unsaved.has(row.key)" class="tree-dirty" title="Changes not saved to the file">●</span>
          </div>
        </li>
      </template>
    </ul>
  </nav>
</template>
