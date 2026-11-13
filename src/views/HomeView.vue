<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  state,
  createDoc,
  moveToFolder,
  requestPersistence,
  storageEstimate,
  deleteDoc,
  downloadBackup,
  emptyTrash,
  importBackup,
  restoreDoc,
  trashDoc,
  setDocOptions,
  TRASH_DAYS,
} from '../store'
import { displayName } from '../naming'
import { openFiles, TEXT_ACCEPT } from '../openFiles'
import { canSaveInPlace, pickFiles } from '../fileaccess'
import { canOpenFolder, openFolder } from '../workspace'
import { showToast } from '../toast'
import { prefs } from '../prefs'
import { SORTS, labelsOf, sortDocs } from '../folders'
import { togglePin } from '../drafts'

const router = useRouter()
const fileInput = ref(null)
const backupInput = ref(null)
const query = ref('')

// Drafts only: files from open folders are in the sidebar, not here
// (see docs/files-and-drafts.md).
const live = computed(() => state.docs.filter((d) => !d.deletedAt && d.kind !== 'file'))

// Copies of files from folders closed before Plumb kept files and drafts
// apart (see migrate.js): offered to the Trash once.
const copies = computed(() => live.value.filter((d) => d.copyOf))
function trashCopies() {
  const list = copies.value.map((d) => d.id)
  for (const id of list) trashDoc(id)
  forgetCopies(list)
  showToast(`Moved ${list.length} cop${list.length === 1 ? 'y' : 'ies'} to the Trash.`, {
    action: { label: 'Undo', run: () => list.forEach((id) => restoreDoc(id)) },
    timeout: 10000,
  })
}
const forgetCopies = (ids = copies.value.map((d) => d.id)) => ids.forEach((id) => setDocOptions(id, { copyOf: undefined }))

// --- Labels, pinning and sorting ------------------------------------------------

// Labels: the folders drafts were filed in before Plumb kept files and
// drafts apart. They can be filtered by and removed, not made (see folders.js).
const labels = computed(() => labelsOf(live.value))
const label = computed({
  get: () => (labels.value.some((l) => l.label === prefs.labelView) ? prefs.labelView : ''),
  set: (v) => (prefs.labelView = v),
})
const inView = computed(() => (label.value ? live.value.filter((d) => d.folder === label.value) : live.value))
function removeLabel(doc) {
  const old = doc.folder
  moveToFolder(doc.id, '')
  showToast(`Removed the label “${old}” from “${displayName(doc.name)}”.`, {
    action: { label: 'Undo', run: () => moveToFolder(doc.id, old) },
  })
}

// Filter by name or content, ignoring case; pinned drafts first.
const docs = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = q
    ? inView.value.filter((d) => d.name.toLowerCase().includes(q) || d.content.toLowerCase().includes(q))
    : inView.value
  return sortDocs(list, prefs.sort)
})

const trash = computed(() =>
  state.docs.filter((d) => d.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt),
)
const showTrash = ref(false)

function newDoc() {
  const doc = createDoc()
  requestPersistence()
  router.push({ name: 'edit', params: { id: doc.id } })
}

// Where the browser can, open through its file picker so the documents stay
// linked to their files and Save writes back to them.
async function openPicker() {
  if (!canSaveInPlace()) return fileInput.value.click()
  try {
    const picked = await pickFiles()
    if (picked.length) await openFiles(picked, router)
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
  await openFiles(files, router)
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
    showToast(err instanceof SyntaxError ? "This file isn't a Plumb backup." : err.message)
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
      <nav class="folders" aria-label="Labels">
        <button
          class="folder-item"
          :class="{ active: !label }"
          :aria-current="!label ? 'true' : undefined"
          @click="label = ''"
        >
          <span>All drafts</span><span class="count">{{ live.length }}</span>
        </button>
        <template v-if="labels.length">
          <p class="hint labels-head">Labels</p>
          <button
            v-for="l in labels"
            :key="l.label"
            class="folder-item"
            :class="{ active: label === l.label }"
            :title="`Drafts labelled “${l.label}”`"
            :aria-current="label === l.label ? 'true' : undefined"
            @click="label = l.label"
          >
            <span class="folder-name">{{ l.label }}</span><span class="count">{{ l.count }}</span>
          </button>
        </template>
      </nav>

      <div class="list-pane">
        <div v-if="copies.length" class="banner info" role="status">
          <span>
            <strong v-if="copies.length === 1">1 draft is a copy of a file from a folder you closed.</strong>
            <strong v-else>{{ copies.length }} drafts are copies of files from folders you closed.</strong>
            The files are on your disk: Plumb no longer keeps copies of them.
          </span>
          <span class="banner-actions">
            <button class="primary" @click="trashCopies">Move them to the Trash</button>
            <button @click="forgetCopies()">Keep them</button>
            <button title="Download every draft as one backup file first" @click="downloadBackup">Export a backup first</button>
          </span>
        </div>

        <div v-if="live.length" class="list-tools">
          <input
            v-model="query"
            class="filter"
            type="search"
            placeholder="Filter drafts"
            aria-label="Filter drafts by name or text"
          />
          <label class="sort">
            <span class="hint">Sort</span>
            <select v-model="prefs.sort" aria-label="Sort drafts by">
              <option v-for="(s, key) in SORTS" :key="key" :value="key">{{ s.label }}</option>
            </select>
          </label>
        </div>

        <p v-if="!live.length" class="empty">
          No drafts yet. Create one, open a file, or drop files anywhere on this page.
        </p>
        <p v-else-if="!docs.length && query" class="empty">No drafts match “{{ query }}”.</p>
        <p v-else-if="!docs.length" class="empty">No drafts have this label any more.</p>

        <ul v-else class="doc-list">
          <li v-for="doc in docs" :key="doc.id">
            <RouterLink :to="{ name: 'edit', params: { id: doc.id } }" class="doc-link">
              <strong :class="{ untitled: !doc.name?.trim() }">{{ displayName(doc.name) }}</strong>
              <small>{{ fmt(doc.updatedAt) }} · {{ doc.content.length.toLocaleString() }} chars</small>
            </RouterLink>
            <span v-if="doc.folder" class="label-chip" :title="`Label: ${doc.folder}`">
              {{ doc.folder }}
              <button
                class="label-remove"
                :aria-label="`Remove the label ${doc.folder} from ${displayName(doc.name)}`"
                title="Remove this label"
                @click="removeLabel(doc)"
              >×</button>
            </span>
            <button
              class="icon-button pin-button"
              :class="{ pinned: doc.pinned }"
              :aria-pressed="!!doc.pinned"
              :title="doc.pinned ? 'Unpin' : 'Pin to the top of the list'"
              :aria-label="`${doc.pinned ? 'Unpin' : 'Pin'} ${displayName(doc.name)}`"
              @click="togglePin(doc.id)"
            >
              📌
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


  </section>
</template>
