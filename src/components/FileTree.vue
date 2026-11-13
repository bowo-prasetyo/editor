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
import { dismissReturning, putBack, returning, saveFolderFiles, unsavedIn } from '../closing'
import { t } from '../i18n'
import { formatList } from '../locale'
import { prepareForSave } from '../saveall'
import { displayName } from '../naming'
import CloseFolderDialog from './CloseFolderDialog.vue'

// The folders opened from disk, one tree each. A tree is drawn as a flat
// list of rows (folders are read only when expanded), starting with the
// folder itself, and works like other file trees from the keyboard: ↑/↓
// move, → expands, ← collapses or goes to the parent folder, Enter opens.
// A folder's buttons sit outside its tree (a tree holds only tree items).
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
      return note(t('tree.loading'))
    }
    if (list.error) return note(t('tree.cantRead'))
    if (!list.length) return note(t('tree.empty'))
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
// The same rows by folder: each root with the rows inside it, one tree each.
const groups = computed(() => {
  const out = []
  for (const row of rows.value) {
    if (row.kind === 'root') out.push({ root: row, children: [] })
    else out.at(-1)?.children.push(row)
  }
  return out
})

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
// The row that takes Tab focus in each folder's tree: the selected one, else
// the active file, else the folder itself.
const tabStops = computed(() => {
  const stops = new Set()
  for (const { root, children } of groups.value) {
    const keys = [root.key, ...children.filter((r) => r.kind !== 'note').map((r) => r.key)]
    stops.add([selected.value, active.value].find((k) => keys.includes(k)) ?? root.key)
  }
  return stops
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
  // Only keys pressed on a row: a folder's buttons (New file, Put the edits
  // back…) are inside the tree too, and Enter or Space must still press them.
  if (!e.target.matches?.('[role="treeitem"]')) return
  // Arrow keys stay in the folder's own tree.
  const rootId = rows.value.find((r) => r.key === e.target.dataset.key)?.rootId
  const list = focusable.value.filter((r) => r.rootId === rootId)
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
    if (refreshed === 'reloaded') showToast(t('tree.reloaded', { name: row.name }), { timeout: 4000 })
    if (refreshed === 'conflict') {
      showToast(t('tree.conflict', { name: row.name }), {
        timeout: 10000,
      })
    }
    router.push({ name: 'edit', params: { id: doc.id } })
  } catch (e) {
    if (e instanceof BinaryFileError) showToast(t('open.notTextOne', { name: row.name }))
    else if (e?.name === 'NotAllowedError') {
      const root = roots.get(row.rootId)
      if (root) root.permission = 'prompt'
    } else if (e?.name === 'NotFoundError') {
      showToast(t('tree.gone', { name: row.name }))
      forgetListings(row.rootId)
    } else {
      console.error(e)
      showToast(t('open.failed', { name: row.name, error: e.message }))
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
  const what = kind === 'file' ? 'tree.newFilePrompt' : 'tree.newFolderPrompt'
  const name = prompt(path ? t(`${what}In`, { path }) : t(`${what}Top`), '')
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
  if (!(await reconnect(rootId))) showToast(t('tree.accessRefused'))
}

// Closing a folder. With files not saved to disk, ask first (see closing.js):
// save them all, keep them as drafts, or cancel. Nothing unsaved is lost.
const closing = ref(null) // { id, name, files, busy }
async function onClose(w) {
  const unsaved = unsavedIn(w.id)
  if (!unsaved.length) {
    await closeFolder(w.id)
    return showToast(t('tree.closed', { name: w.name }), { timeout: 3000 })
  }
  closing.value = { ...w, files: unsaved.map((d) => displayName(d.name)), busy: false }
}

async function onCloseSave() {
  const w = closing.value
  w.busy = true
  try {
    const { saved, left } = await saveFolderFiles(w.id, { prepare: prepareForSave })
    if (left.length) {
      const names = formatList(left.map((d) => t('common.quoted', { text: displayName(d.name) })))
      return showToast(t('tree.stillOpen', { name: w.name, names, count: left.length }), { timeout: 10000 })
    }
    await closeFolder(w.id)
    showToast(t('tree.savedAndClosed', { name: w.name, count: saved }), { timeout: 4000 })
  } finally {
    closing.value = null
  }
}

async function onCloseKeep() {
  const w = closing.value
  closing.value = null
  const kept = await closeFolder(w.id)
  showToast(t('tree.closedKept', { name: w.name, count: kept }), { timeout: 8000 })
}

// Opening a folder again: offer to put kept drafts' edits back into their files.
async function onPutBack(rootId) {
  const { back, changed, missing } = await putBack(rootId)
  const parts = [t('tree.putBack', { count: back })]
  if (changed) parts.push(t('tree.putBackChanged', { count: changed }))
  if (missing) parts.push(t('tree.putBackMissing', { count: missing }))
  showToast(parts.join(' '), { timeout: changed || missing ? 10000 : 4000 })
}

const refresh = (rootId) => forgetListings(rootId)
</script>

<template>
  <nav ref="listEl" class="file-tree" :aria-label="t('tree.label')">
    <section v-for="{ root: row, children } in groups" :key="row.key" class="tree-root">
      <!-- Notes about the folder: outside its tree (a tree holds only items),
           and before it, so they're read first; drawn under the folder's row,
           which is pinned to the top of the section (style.css). -->
      <p v-if="returning[row.rootId]?.length" class="tree-note" role="status">
        {{ t('tree.returning', { count: returning[row.rootId].length, name: row.name }) }}
        <button class="mini primary-mini" @click="onPutBack(row.rootId)">{{ t('tree.putBackButton') }}</button>
        <button class="mini" @click="dismissReturning(row.rootId)">{{ t('tree.notNow') }}</button>
      </p>
      <p v-if="!row.root" class="tree-note">
        {{ t('tree.unavailable', { name: row.name }) }}
      </p>
      <p v-else-if="row.root.permission !== 'granted'" class="tree-note">
        {{ t('tree.needsPermission', { name: row.name }) }}
        <button class="mini primary-mini" @click="onReconnect(row.rootId)">{{ t('unread.allow') }}</button>
      </p>
      <ul role="tree" :aria-label="t('tree.filesIn', { name: row.name })" @keydown="onKey">
        <li role="none" class="root-item">
          <div
            role="treeitem"
            :aria-level="1"
            aria-expanded="true"
            :data-key="row.key"
            :tabindex="tabStops.has(row.key) ? 0 : -1"
            @focus="selected = row.key"
            class="tree-row root-row"
            :class="{ selected: selected === row.key }"
            :title="row.name"
            @click="select(row, { focus: false })"
          >
            <span class="tree-name">{{ row.name }}</span>
          </div>
        </li>
        <template v-for="child in children" :key="child.key">
          <!-- "Loading…", "Empty": items you can't pick. -->
          <li
            v-if="child.kind === 'note'"
            role="treeitem"
            aria-disabled="true"
            :aria-level="child.depth + 1"
            class="tree-note"
            :style="{ paddingLeft: 8 + child.depth * 14 + 'px' }"
          >
            {{ child.name }}
          </li>
          <li v-else role="none">
            <div
              role="treeitem"
              :aria-level="child.depth + 1"
              :aria-expanded="child.kind === 'directory' ? isExpanded(child.rootId, child.path) : undefined"
              :aria-current="active === child.key ? 'page' : undefined"
              :data-key="child.key"
              :tabindex="tabStops.has(child.key) ? 0 : -1"
              @focus="selected = child.key"
              class="tree-row"
              :class="{ selected: selected === child.key, active: active === child.key, hidden: child.name.startsWith('.') }"
              :style="{ paddingLeft: 8 + (child.depth - 1) * 14 + 'px' }"
              :title="child.path"
              @click="activate(child)"
            >
              <span class="tree-chevron" aria-hidden="true">{{
                child.kind === 'directory' ? (isExpanded(child.rootId, child.path) ? '▾' : '▸') : ''
              }}</span>
              <span class="tree-name">{{ child.name }}</span>
              <span v-if="unsaved.has(child.key)" class="tree-dirty" :title="t('tree.dirty')">●</span>
            </div>
          </li>
        </template>
      </ul>
      <!-- Outside the tree, drawn over the folder's row. -->
      <span class="root-actions" role="group" :aria-label="t('tree.actions', { name: row.name })">
        <template v-if="row.root?.permission === 'granted'">
          <button class="mini" :title="t('tree.newFile')" :aria-label="t('tree.newFile')" @click="create(row.rootId, 'file')">{{ t('tree.newFileButton') }}</button>
          <button class="mini" :title="t('tree.newFolder')" :aria-label="t('tree.newFolder')" @click="create(row.rootId, 'directory')">{{ t('tree.newFolderButton') }}</button>
          <button class="mini" :title="t('tree.refreshTitle')" :aria-label="t('tree.refresh')" @click="refresh(row.rootId)">↻</button>
        </template>
        <button class="mini" :title="t('tree.close', { name: row.name })" :aria-label="t('tree.close', { name: row.name })" @click="onClose({ id: row.rootId, name: row.name })">×</button>
      </span>
    </section>
  </nav>
  <CloseFolderDialog
    v-if="closing"
    :folder="closing.name"
    :files="closing.files"
    :busy="closing.busy"
    @save="onCloseSave"
    @keep="onCloseKeep"
    @cancel="closing = null"
  />
</template>
