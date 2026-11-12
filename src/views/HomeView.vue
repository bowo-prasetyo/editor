<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { state, createDoc, deleteDoc, importFile } from '../store'

const router = useRouter()
const fileInput = ref(null)
const docs = computed(() => [...state.docs].sort((a, b) => b.updatedAt - a.updatedAt))

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

function remove(doc) {
  if (confirm(`Delete "${doc.name}"?`)) deleteDoc(doc.id)
}

const fmt = (t) => new Date(t).toLocaleString()
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
        <button class="danger" title="Delete" @click="remove(doc)">✕</button>
      </li>
    </ul>
  </section>
</template>
