<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  state,
  createDoc,
  deleteDoc,
  emptyTrash,
  importFile,
  restoreDoc,
  trashDoc,
  TRASH_DAYS,
} from '../store'

const router = useRouter()
const fileInput = ref(null)
const byRecent = (a, b) => b.updatedAt - a.updatedAt
const docs = computed(() => state.docs.filter((d) => !d.deletedAt).sort(byRecent))
const trash = computed(() =>
  state.docs.filter((d) => d.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt),
)
const showTrash = ref(false)

function newDoc() {
  const doc = createDoc()
  router.push({ name: 'edit', params: { id: doc.id } })
}

async function onFile(e) {
  const file = e.target.files[0]
  if (!file) return
  const doc = await importFile(file)
  e.target.value = ''
  router.push({ name: 'edit', params: { id: doc.id } })
}

// Deleting is undoable, so no confirmation dialog: show a toast instead.
const toast = ref(null) // { doc }
let toastTimer
function remove(doc) {
  trashDoc(doc.id)
  toast.value = { doc }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = null), 8000)
}
function undoRemove() {
  if (toast.value) restoreDoc(toast.value.doc.id)
  toast.value = null
}
onBeforeUnmount(() => clearTimeout(toastTimer))

function deleteForever(doc) {
  if (confirm(`Delete "${doc.name || 'Untitled'}" forever? This can't be undone.`)) deleteDoc(doc.id)
}
function onEmptyTrash() {
  const n = trash.value.length
  if (confirm(`Delete ${n} document${n === 1 ? '' : 's'} in the Trash forever? This can't be undone.`))
    emptyTrash()
}

const fmt = (t) => new Date(t).toLocaleString()
const daysLeft = (d) =>
  Math.max(0, Math.ceil(TRASH_DAYS - (Date.now() - d.deletedAt) / (24 * 60 * 60 * 1000)))
</script>

<template>
  <section class="home">
    <div class="actions">
      <button class="primary" @click="newDoc">New document</button>
      <button @click="fileInput.click()">Open file…</button>
      <input ref="fileInput" type="file" hidden @change="onFile" />
    </div>

    <p v-if="!docs.length" class="empty">No documents yet. Create one to get started.</p>

    <ul v-else class="doc-list">
      <li v-for="doc in docs" :key="doc.id">
        <RouterLink :to="{ name: 'edit', params: { id: doc.id } }" class="doc-link">
          <strong>{{ doc.name }}</strong>
          <small>{{ fmt(doc.updatedAt) }} · {{ doc.content.length }} chars</small>
        </RouterLink>
        <button
          class="danger"
          :title="`Move ${doc.name} to Trash`"
          :aria-label="`Move ${doc.name} to Trash`"
          @click="remove(doc)"
        >
          ✕
        </button>
      </li>
    </ul>

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
              <strong>{{ doc.name }}</strong>
              <small>Deleted {{ fmt(doc.deletedAt) }} · {{ daysLeft(doc) }} days left</small>
            </RouterLink>
            <button @click="restoreDoc(doc.id)">Restore</button>
            <button class="danger" @click="deleteForever(doc)">Delete forever</button>
          </li>
        </ul>
      </template>
    </div>

    <div v-if="toast" class="toast" role="status">
      <span>Moved “{{ toast.doc.name }}” to Trash.</span>
      <button @click="undoRemove">Undo</button>
    </div>
  </section>
</template>
