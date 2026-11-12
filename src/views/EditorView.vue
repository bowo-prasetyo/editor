<script setup>
import { computed, ref } from 'vue'
import { getDoc, updateDoc, downloadDoc } from '../store'

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

const lineCount = computed(() => content.value.split('\n').length)
const wordCount = computed(() => (content.value.match(/\S+/g) || []).length)

function updateCursor() {
  const el = textarea.value
  if (!el) return
  const before = el.value.slice(0, el.selectionStart).split('\n')
  cursor.value = { line: before.length, col: before.at(-1).length + 1 }
}

// Insert two spaces on Tab instead of moving focus; Ctrl/Cmd+S downloads.
function onKeydown(e) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const el = e.target
    const { selectionStart: s, selectionEnd: end } = el
    content.value = el.value.slice(0, s) + '  ' + el.value.slice(end)
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = s + 2
      updateCursor()
    })
  } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    downloadDoc(doc.value)
  }
}

const gutter = ref(null)
function syncScroll(e) {
  if (gutter.value) gutter.value.scrollTop = e.target.scrollTop
}
</script>

<template>
  <section v-if="doc" class="editor">
    <div class="toolbar">
      <input v-model="name" class="name" spellcheck="false" aria-label="File name" />
      <button @click="downloadDoc(doc)" title="Ctrl/Cmd+S">Download</button>
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
        @keydown="onKeydown"
        @keyup="updateCursor"
        @click="updateCursor"
        @scroll="syncScroll"
      />
    </div>

    <footer class="status">
      <span>Ln {{ cursor.line }}, Col {{ cursor.col }}</span>
      <span>{{ lineCount }} lines · {{ wordCount }} words · {{ content.length }} chars</span>
    </footer>
  </section>

  <section v-else class="home">
    <p class="empty">Document not found. <RouterLink to="/">Back to documents</RouterLink></p>
  </section>
</template>
