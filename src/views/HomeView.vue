<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  state,
  createDoc,
  moveToFolder,
  removeFolder,
  renameFolder,
  requestPersistence,
  storageEstimate,
  deleteDoc,
  downloadBackup,
  emptyTrash,
  importBackup,
  restoreDoc,
  trashDoc,
  TRASH_DAYS,
} from '../store'
import { displayName } from '../naming'
import { openFiles, TEXT_ACCEPT } from '../openFiles'
import { canSaveInPlace, pickFiles } from '../fileaccess'
import { canOpenFolder, openFolder } from '../workspace'
import { showToast } from '../toast'
import { prefs } from '../prefs'
import { NONE, SORTS, folderTree, inFolder, normalizeFolder, parentFolder, renamedFolder, sortDocs } from '../folders'
import FolderDialog from '../components/FolderDialog.vue'

const router = useRouter()
const fileInput = ref(null)
const backupInput = ref(null)
const query = ref('')

const live = computed(() => state.docs.filter((d) => !d.deletedAt))

// --- Folders and sorting ------------------------------------------------------

const tree = computed(() => folderTree(live.value, prefs.folders))
const folderPaths = computed(() => tree.value.map((f) => f.path))
const folder = computed({
  get: () => (prefs.folderView === NONE || folderPaths.value.includes(prefs.folderView) ? prefs.folderView : ''),
  set: (v) => (prefs.folderView = v),
})
const noFolderCount = computed(() => live.value.filter((d) => !d.folder).length)
const inView = computed(() => live.value.filter((d) => inFolder(d, folder.value)))

// Filter by name or content, ignoring case, within the folder shown.
const docs = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = q
    ? inView.value.filter((d) => d.name.toLowerCase().includes(q) || d.content.toLowerCase().includes(q))
    : inView.value
  return sortDocs(list, prefs.sort)
})

// Dialogs for New folder / Rename folder / Move to folder.
const dialog = ref(null) // { kind, title, initial, confirm, doc? }
function newFolder() {
  const base = folder.value && folder.value !== NONE ? folder.value + '/' : ''
  dialog.value = { kind: 'new', title: 'New folder', initial: base, confirm: 'Create' }
}
function renameCurrent() {
  dialog.value = { kind: 'rename', title: `Rename “${folder.value}”`, initial: folder.value, confirm: 'Rename' }
}
function moveDoc(doc) {
  dialog.value = {
    kind: 'move',
    title: `Move “${displayName(doc.name)}” to folder`,
    initial: doc.folder ?? '',
    confirm: 'Move',
    doc,
  }
}
function onDialog(path) {
  const d = dialog.value
  dialog.value = null
  if (d.kind === 'new') {
    if (!folderPaths.value.includes(path)) prefs.folders = [...prefs.folders, path]
    folder.value = path
  } else if (d.kind === 'rename') {
    const from = folder.value
    if (path === from) return
    renameFolder(from, path)
    // Empty folders created earlier move along too.
    prefs.folders = prefs.folders.map((f) => renamedFolder(f, from, path) ?? f)
    folder.value = path
  } else if (d.kind === 'move') {
    moveToFolder(d.doc.id, path)
    if (path && !folderPaths.value.includes(path)) prefs.folders = [...prefs.folders, path]
    showToast(path ? `Moved “${displayName(d.doc.name)}” to ${path}.` : `Moved “${displayName(d.doc.name)}” out of its folder.`)
  }
}
// Removing a folder never deletes documents: they move up to its parent.
function removeCurrent() {
  const path = folder.value
  const n = inView.value.length
  const parent = parentFolder(path)
  const where = parent ? `“${parent}”` : 'no folder'
  if (n && !confirm(`Remove the folder “${path}”? Its ${n} document${n === 1 ? '' : 's'} will move to ${where}.`)) return
  removeFolder(path)
  prefs.folders = prefs.folders.filter((f) => renamedFolder(f, path, parent) === undefined)
  folder.value = parent
}

// Drag a document onto a folder in the sidebar to move it there.
const dragOver = ref(null)
function onDocDragStart(e, doc) {
  e.dataTransfer.setData('application/x-editor-doc', doc.id)
  e.dataTransfer.effectAllowed = 'move'
}
function onFolderDrop(e, path) {
  dragOver.value = null
  const id = e.dataTransfer.getData('application/x-editor-doc')
  if (!id) return
  e.preventDefault()
  moveToFolder(id, path === NONE ? '' : path)
}
const acceptsDoc = (e) => [...e.dataTransfer.types].includes('application/x-editor-doc')
const trash = computed(() =>
  state.docs.filter((d) => d.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt),
)
const showTrash = ref(false)

// New and opened documents go into the folder shown.
const targetFolder = () => (folder.value && folder.value !== NONE ? folder.value : '')

function newDoc() {
  const doc = createDoc()
  if (targetFolder()) moveToFolder(doc.id, targetFolder())
  requestPersistence()
  router.push({ name: 'edit', params: { id: doc.id } })
}

// Where the browser can, open through its file picker so the documents stay
// linked to their files and Save writes back to them.
async function openPicker() {
  if (!canSaveInPlace()) return fileInput.value.click()
  try {
    const picked = await pickFiles()
    if (picked.length) await openFiles(picked, router, { folder: targetFolder() })
  } catch (e) {
    showToast(`Couldn't open the files: ${e.message}`)
  }
}

// A folder from disk: its files show in the sidebar (Chrome, Edge).
async function onOpenFolder() {
  try {
    const w = await openFolder()
    if (w) showToast(`Opened “${w.name}”. Its files are in the sidebar (Ctrl/Cmd+B shows or hides it).`, { timeout: 5000 })
  } catch (e) {
    showToast(`Couldn't open the folder: ${e.message}`)
  }
}

async function onFiles(e) {
  const files = [...e.target.files]
  e.target.value = ''
  await openFiles(files, router, { folder: targetFolder() })
}

async function onBackup(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    const { added, skipped } = importBackup(JSON.parse(await file.text()))
    const docs = (n) => `${n} document${n === 1 ? '' : 's'}`
    showToast(
      !added
        ? `Nothing to restore: ${skipped === 1 ? 'that document is' : `all ${docs(skipped)} are`} already here.`
        : `Restored ${docs(added)}.` + (skipped ? ` ${skipped} already here ${skipped === 1 ? 'was' : 'were'} skipped.` : ''),
    )
  } catch (err) {
    showToast(err instanceof SyntaxError ? "This file isn't an editor backup." : err.message)
  }
}

// Deleting is undoable, so no confirmation dialog: offer Undo instead.
function remove(doc) {
  trashDoc(doc.id)
  showToast(`Moved “${displayName(doc.name)}” to Trash.`, {
    action: { label: 'Undo', run: () => restoreDoc(doc.id) },
    timeout: 8000,
  })
}

function deleteForever(doc) {
  if (confirm(`Delete "${displayName(doc.name)}" forever? This can't be undone.`)) deleteDoc(doc.id)
}
function onEmptyTrash() {
  const n = trash.value.length
  if (confirm(`Delete ${n} document${n === 1 ? '' : 's'} in the Trash forever? This can't be undone.`))
    emptyTrash()
}

// Storage use, shown under the list so people know how much room is left.
const usage = ref(null)
const mb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(0.1, b / 1e6).toFixed(1)} MB`)
onMounted(async () => {
  const est = await storageEstimate()
  if (est?.quota) usage.value = `${mb(est.usage ?? 0)} used of ${mb(est.quota)} available`
})

const fmt = (t) => new Date(t).toLocaleString()
const daysLeft = (d) =>
  Math.max(0, Math.ceil(TRASH_DAYS - (Date.now() - d.deletedAt) / (24 * 60 * 60 * 1000)))
</script>

<template>
  <section class="home">
    <div class="actions">
      <button class="primary" @click="newDoc">New document</button>
      <button @click="openPicker">Open files…</button>
      <button v-if="canOpenFolder()" title="Open a folder from your computer and browse its files in the sidebar" @click="onOpenFolder">
        Open folder…
      </button>
      <input ref="fileInput" type="file" multiple :accept="TEXT_ACCEPT" hidden @change="onFiles" />
      <span class="spacer" />
      <button title="Download every document as one backup file" @click="downloadBackup">
        Export all
      </button>
      <button title="Add the documents from a backup file" @click="backupInput.click()">
        Import backup…
      </button>
      <input ref="backupInput" type="file" accept=".json,application/json" hidden @change="onBackup" />
    </div>

    <div class="home-body">
      <nav class="folders" aria-label="Folders">
        <button
          class="folder-item"
          :class="{ active: !folder, 'drop-target': dragOver === '' }"
          :aria-current="!folder ? 'true' : undefined"
          @click="folder = ''"
        >
          <span>All documents</span><span class="count">{{ live.length }}</span>
        </button>
        <button
          v-for="f in tree"
          :key="f.path"
          class="folder-item"
          :class="{ active: folder === f.path, 'drop-target': dragOver === f.path }"
          :style="{ paddingLeft: 10 + f.depth * 14 + 'px' }"
          :title="f.path"
          :aria-current="folder === f.path ? 'true' : undefined"
          @click="folder = f.path"
          @dragover="(e) => acceptsDoc(e) && (e.preventDefault(), (dragOver = f.path))"
          @dragleave="dragOver = null"
          @drop="(e) => onFolderDrop(e, f.path)"
        >
          <span class="folder-name">📁 {{ f.name }}</span><span class="count">{{ f.count }}</span>
        </button>
        <button
          v-if="tree.length"
          class="folder-item"
          :class="{ active: folder === NONE, 'drop-target': dragOver === NONE }"
          :aria-current="folder === NONE ? 'true' : undefined"
          @click="folder = NONE"
          @dragover="(e) => acceptsDoc(e) && (e.preventDefault(), (dragOver = NONE))"
          @dragleave="dragOver = null"
          @drop="(e) => onFolderDrop(e, NONE)"
        >
          <span>No folder</span><span class="count">{{ noFolderCount }}</span>
        </button>
        <button class="link new-folder" @click="newFolder">+ New folder</button>
      </nav>

      <div class="list-pane">
        <div v-if="folder && folder !== NONE" class="folder-head">
          <strong>📁 {{ folder }}</strong>
          <span class="spacer" />
          <button @click="renameCurrent">Rename</button>
          <button @click="removeCurrent">Remove folder</button>
        </div>

        <div v-if="live.length" class="list-tools">
          <input
            v-model="query"
            class="filter"
            type="search"
            placeholder="Filter documents"
            aria-label="Filter documents by name or text"
          />
          <label class="sort">
            <span class="hint">Sort</span>
            <select v-model="prefs.sort" aria-label="Sort documents by">
              <option v-for="(s, key) in SORTS" :key="key" :value="key">{{ s.label }}</option>
            </select>
          </label>
        </div>

        <p v-if="!live.length" class="empty">
          No documents yet. Create one, open a file, or drop files anywhere on this page.
        </p>
        <p v-else-if="!docs.length && query" class="empty">No documents match “{{ query }}”.</p>
        <p v-else-if="!docs.length" class="empty">
          This folder is empty. New documents and opened files go into the folder shown, or drag a document onto a folder.
        </p>

        <ul v-else class="doc-list">
          <li v-for="doc in docs" :key="doc.id">
            <RouterLink
              :to="{ name: 'edit', params: { id: doc.id } }"
              class="doc-link"
              draggable="true"
              @dragstart="(e) => onDocDragStart(e, doc)"
            >
              <strong :class="{ untitled: !doc.name?.trim() }">{{ displayName(doc.name) }}</strong>
              <small>
                <template v-if="doc.folder && doc.folder !== folder">📁 {{ doc.folder }} · </template>
                {{ fmt(doc.updatedAt) }} · {{ doc.content.length.toLocaleString() }} chars
              </small>
            </RouterLink>
            <button
              class="icon-button"
              :title="`Move ${displayName(doc.name)} to a folder`"
              :aria-label="`Move ${displayName(doc.name)} to a folder`"
              @click="moveDoc(doc)"
            >
              📁
            </button>
            <button
              class="danger"
              :title="`Move ${displayName(doc.name)} to Trash`"
              :aria-label="`Move ${displayName(doc.name)} to Trash`"
              @click="remove(doc)"
            >
              ✕
            </button>
          </li>
        </ul>
      </div>
    </div>

    <p v-if="state.backend" class="hint storage-info">
      <template v-if="state.backend === 'localStorage'">
        Documents are kept in this browser's small localStorage (about 5 MB) because IndexedDB isn't available.
      </template>
      <template v-else>Documents are kept in this browser{{ usage ? ` · ${usage}` : '' }}.</template>
      <template v-if="!state.persisted"> The browser may clear them if the disk gets full: export a backup now and then.</template>
    </p>

    <div v-if="trash.length" class="trash">
      <div class="trash-head">
        <button class="link" :aria-expanded="showTrash" @click="showTrash = !showTrash">
          {{ showTrash ? '▾' : '▸' }} Trash ({{ trash.length }})
        </button>
        <button v-if="showTrash" class="danger" @click="onEmptyTrash">Empty trash</button>
      </div>
      <template v-if="showTrash">
        <p class="hint">Documents in the Trash are deleted forever after {{ TRASH_DAYS }} days.</p>
        <ul class="doc-list">
          <li v-for="doc in trash" :key="doc.id">
            <RouterLink :to="{ name: 'edit', params: { id: doc.id } }" class="doc-link">
              <strong>{{ displayName(doc.name) }}</strong>
              <small>Deleted {{ fmt(doc.deletedAt) }} · {{ daysLeft(doc) }} days left</small>
            </RouterLink>
            <button @click="restoreDoc(doc.id)">Restore</button>
            <button class="danger" @click="deleteForever(doc)">Delete forever</button>
          </li>
        </ul>
      </template>
    </div>

    <FolderDialog
      v-if="dialog"
      :title="dialog.title"
      :initial="dialog.initial"
      :confirm="dialog.confirm"
      :folders="folderPaths"
      :allow-empty="dialog.kind === 'move'"
      @submit="onDialog"
      @cancel="dialog = null"
    />
  </section>
</template>
