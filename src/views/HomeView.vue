<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  state,
  createDoc,
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
import { showToast } from '../toast'

const router = useRouter()
const fileInput = ref(null)
const backupInput = ref(null)
const query = ref('')

const byRecent = (a, b) => b.updatedAt - a.updatedAt
const live = computed(() => state.docs.filter((d) => !d.deletedAt))
// Filter by name or content, ignoring case.
const docs = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = q
    ? live.value.filter((d) => d.name.toLowerCase().includes(q) || d.content.toLowerCase().includes(q))
    : live.value
  return [...list].sort(byRecent)
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

    <input
      v-if="live.length"
      v-model="query"
      class="filter"
      type="search"
      placeholder="Filter documents"
      aria-label="Filter documents by name or text"
    />

    <p v-if="!live.length" class="empty">
      No documents yet. Create one, open a file, or drop files anywhere on this page.
    </p>
    <p v-else-if="!docs.length" class="empty">No documents match “{{ query }}”.</p>

    <ul v-else class="doc-list">
      <li v-for="doc in docs" :key="doc.id">
        <RouterLink :to="{ name: 'edit', params: { id: doc.id } }" class="doc-link">
          <strong :class="{ untitled: !doc.name?.trim() }">{{ displayName(doc.name) }}</strong>
          <small>{{ fmt(doc.updatedAt) }} · {{ doc.content.length }} chars</small>
        </RouterLink>
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
