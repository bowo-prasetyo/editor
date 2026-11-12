<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { state, getDoc, updateDoc, downloadDoc, flushAll, retryFailed } from '../store'
import { indentEdit, outdentEdit } from '../indent'

const props = defineProps({ id: { type: String, required: true } })

const doc = computed(() => getDoc(props.id))
const textarea = ref(null)
const cursor = ref({ line: 1, col: 1 })

const content = computed({
  get: () => doc.value?.content ?? '',
  set: (v) => updateDoc(props.id, { content: v }),
})
const name = computed({
  get: () => doc.value?.name ?? '',
  set: (v) => updateDoc(props.id, { name: v }),
})

const status = computed(() => state.status[props.id])
const statusLabel = computed(
  () => ({ saved: 'Saved', pending: 'Saving…', error: 'Not saved' })[status.value] ?? '',
)

const lineCount = computed(() => content.value.split('\n').length)
const wordCount = computed(() => (content.value.match(/\S+/g) || []).length)

function updateCursor() {
  const el = textarea.value
  if (!el) return
  const before = el.value.slice(0, el.selectionStart).split('\n')
  cursor.value = { line: before.length, col: before.at(-1).length + 1 }
}

// Apply an edit through the browser's editing pipeline so it lands on the
// native undo stack (Ctrl/Cmd+Z keeps working). Setting el.value directly
// would wipe the undo history.
function applyEdit(el, edit) {
  el.setSelectionRange(edit.from, edit.to)
  const ok =
    edit.insert === ''
      ? document.execCommand('delete', false)
      : document.execCommand('insertText', false, edit.insert)
  if (!ok) {
    el.setRangeText(edit.insert, edit.from, edit.to)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  el.setSelectionRange(edit.selStart, edit.selEnd)
  updateCursor()
}

// Tab indents, Shift+Tab outdents (whole lines when text is selected);
// Ctrl/Cmd+S downloads.
function onKeydown(e) {
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    const el = e.target
    const fn = e.shiftKey ? outdentEdit : indentEdit
    const edit = fn(el.value, el.selectionStart, el.selectionEnd)
    if (edit) applyEdit(el, edit)
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    downloadDoc(doc.value)
  }
}

const gutter = ref(null)
function syncScroll(e) {
  if (gutter.value) gutter.value.scrollTop = e.target.scrollTop
}

onBeforeUnmount(flushAll)
</script>

<template>
  <section v-if="doc" class="editor">
    <div class="toolbar">
      <input v-model="name" class="name" spellcheck="false" aria-label="File name" />
      <button @click="downloadDoc(doc)" title="Ctrl/Cmd+S">Download</button>
    </div>

    <div v-if="status === 'error'" class="banner" role="alert">
      <span>
        <strong>Not saved.</strong> Your browser's storage is full or unavailable, so these changes
        will be lost when you close this tab. Download a copy, or free space by deleting other
        documents.
      </span>
      <span class="banner-actions">
        <button class="primary" @click="downloadDoc(doc)">Download</button>
        <button @click="retryFailed">Try again</button>
      </span>
    </div>

    <div class="pane">
      <pre ref="gutter" class="gutter" aria-hidden="true"><span v-for="n in lineCount" :key="n">{{ n }}
</span></pre>
      <textarea
        ref="textarea"
        v-model="content"
        spellcheck="false"
        wrap="off"
        autofocus
        aria-label="Document text"
        @keydown="onKeydown"
        @keyup="updateCursor"
        @click="updateCursor"
        @select="updateCursor"
        @scroll="syncScroll"
      />
    </div>

    <footer class="status">
      <span>Ln {{ cursor.line }}, Col {{ cursor.col }}</span>
      <span>
        {{ lineCount }} lines · {{ wordCount }} words · {{ content.length }} chars ·
        <span :class="['save', status]" aria-live="polite">{{ statusLabel }}</span>
      </span>
    </footer>
  </section>

  <section v-else class="home">
    <p class="empty">Document not found. <RouterLink to="/">Back to documents</RouterLink></p>
  </section>
</template>
