import { reactive, watch } from 'vue'

// All documents live in localStorage — no server involved.
const KEY = 'editor.documents.v1'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? []
  } catch {
    return []
  }
}

export const state = reactive({ docs: load() })

watch(
  () => state.docs,
  (docs) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(docs))
    } catch (e) {
      console.error('Could not save documents', e)
    }
  },
  { deep: true },
)

export function createDoc(name = 'Untitled.txt', content = '') {
  const doc = { id: crypto.randomUUID(), name, content, updatedAt: Date.now() }
  state.docs.unshift(doc)
  return doc
}

export function getDoc(id) {
  return state.docs.find((d) => d.id === id)
}

export function updateDoc(id, patch) {
  const doc = getDoc(id)
  if (doc) Object.assign(doc, patch, { updatedAt: Date.now() })
}

export function deleteDoc(id) {
  const i = state.docs.findIndex((d) => d.id === id)
  if (i !== -1) state.docs.splice(i, 1)
}

// Open a file from the user's disk and store it as a new document.
export function importFile(file) {
  return file.text().then((text) => createDoc(file.name, text))
}

// Save a document to the user's disk as a download.
export function downloadDoc(doc) {
  const blob = new Blob([doc.content], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = doc.name || 'untitled.txt'
  a.click()
  URL.revokeObjectURL(a.href)
}
