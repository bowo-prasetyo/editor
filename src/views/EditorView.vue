<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  state,
  getDoc,
  updateDoc,
  setDocOptions,
  downloadDoc,
  flushAll,
  retryFailed,
  restoreDoc,
} from '../store'
import { indentEdit, outdentEdit } from '../indent'
import { extension, viewSettings } from '../filetype'
import { ENCODINGS, EOLS } from '../textcodec'
import { prefs, stepFontSize } from '../prefs'
import { showToast } from '../toast'
import { applyEdit, rangeRect } from '../textedit'
import FindBar from '../components/FindBar.vue'

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

const view = computed(() => viewSettings(doc.value))
const isMarkdown = computed(() => ['md', 'markdown', 'mdown'].includes(extension(name.value)))
const previewOn = computed(() => isMarkdown.value && !!doc.value?.preview)
const toggle = (key) => setDocOptions(props.id, { [key]: !view.value[key] })

const status = computed(() => state.status[props.id])
const statusLabel = computed(
  () => ({ saved: 'Saved ✓', pending: 'Saving…', error: 'Not saved' })[status.value] ?? '',
)

// --- Saving to disk, encoding and line endings ---------------------------------

const encoding = computed({
  get: () => (doc.value?.encoding ?? 'utf-8') + (doc.value?.bom ? '+bom' : ''),
  set: (v) => {
    const [enc, bom] = v.split('+')
    setDocOptions(props.id, { encoding: enc, bom: bom === 'bom' })
  },
})
const encodingOptions = [
  ['utf-8', 'UTF-8'],
  ['utf-8+bom', 'UTF-8 BOM'],
  ['utf-16le+bom', 'UTF-16 LE BOM'],
  ['utf-16le', 'UTF-16 LE'],
  ['utf-16be+bom', 'UTF-16 BE BOM'],
  ['utf-16be', 'UTF-16 BE'],
  ['windows-1252', 'Windows-1252'],
]
const eol = computed({
  get: () => doc.value?.eol ?? '\n',
  set: (v) => setDocOptions(props.id, { eol: v }),
})

function save() {
  const { lossy } = downloadDoc(doc.value)
  if (lossy) {
    showToast(
      `Some characters can't be written as ${ENCODINGS[doc.value.encoding]}, so this copy was saved as UTF-8.`,
      { timeout: 10000 },
    )
  }
}

// --- Markdown preview -------------------------------------------------------

const previewHtml = ref('')
let render = null
let renderTimer
async function updatePreview() {
  if (!previewOn.value) return
  render ??= (await import('../markdown')).renderMarkdown
  previewHtml.value = render(content.value)
}
watch(previewOn, updatePreview, { immediate: true })
watch(content, () => {
  if (!previewOn.value) return
  clearTimeout(renderTimer)
  renderTimer = setTimeout(updatePreview, 150)
})

async function print() {
  await updatePreview()
  await nextTick()
  window.print()
}

const lineCount = computed(() => content.value.split('\n').length)
const wordCount = computed(() => (content.value.match(/\S+/g) || []).length)

function updateCursor() {
  const el = textarea.value
  if (!el) return
  const before = el.value.slice(0, el.selectionStart).split('\n')
  cursor.value = { line: before.length, col: before.at(-1).length + 1 }
}

// --- Find / replace ---------------------------------------------------------

const findOpen = ref(false)
const replaceOpen = ref(false)
const findBar = ref(null)

async function openFind(withReplace) {
  findOpen.value = true
  await nextTick()
  findBar.value?.open(withReplace)
}

// Box drawn over the current find match while focus is in the find bar.
const highlight = ref(null) // [start, end]
const textareaFocused = ref(false)
const markStyle = ref(null)
function placeMark() {
  const el = textarea.value
  if (!el || !highlight.value || textareaFocused.value) return (markStyle.value = null)
  const r = rangeRect(el, ...highlight.value)
  const visible = r.top + r.height > el.offsetTop && r.top < el.offsetTop + el.clientHeight
  markStyle.value = visible
    ? { top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px' }
    : null
}
watch([highlight, textareaFocused, () => view.value.wrap], () => nextTick(placeMark))

function closeFind() {
  highlight.value = null
  findOpen.value = false
  replaceOpen.value = false
  textarea.value?.focus()
}

// --- Keyboard ---------------------------------------------------------------

// Tab indents, Shift+Tab outdents (whole lines when text is selected).
function onTextareaKeydown(e) {
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    const el = e.target
    const fn = e.shiftKey ? outdentEdit : indentEdit
    const edit = fn(el.value, el.selectionStart, el.selectionEnd)
    if (edit) {
      applyEdit(el, edit)
      updateCursor()
    }
  }
}

// Editor-wide shortcuts, wherever focus is on the page.
function onWindowKeydown(e) {
  if (!doc.value) return
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  if (mod && !e.altKey && key === 's') {
    e.preventDefault()
    save()
  } else if (mod && !e.altKey && key === 'f') {
    e.preventDefault()
    openFind(false)
  } else if (mod && !e.altKey && key === 'h') {
    e.preventDefault()
    openFind(true)
  } else if (e.altKey && !mod && e.code === 'KeyZ') {
    e.preventDefault()
    toggle('wrap')
  }
}

onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  flushAll()
})

const gutter = ref(null)
function syncScroll(e) {
  if (gutter.value) gutter.value.scrollTop = e.target.scrollTop
  if (highlight.value) placeMark()
}
</script>

<template>
  <section v-if="doc" class="editor">
    <div class="toolbar">
      <input v-model="name" class="name" spellcheck="false" aria-label="File name" />
      <button
        class="toggle"
        :aria-pressed="view.wrap"
        title="Wrap long lines (Alt+Z)"
        @click="toggle('wrap')"
      >
        Wrap
      </button>
      <button
        class="toggle"
        :aria-pressed="view.spellcheck"
        title="Underline spelling mistakes"
        @click="toggle('spellcheck')"
      >
        Spelling
      </button>
      <button
        v-if="isMarkdown"
        class="toggle"
        :aria-pressed="previewOn"
        title="Show the formatted Markdown"
        @click="setDocOptions(doc.id, { preview: !doc.preview })"
      >
        Preview
      </button>
      <button title="Find and replace (Ctrl/Cmd+F)" @click="openFind(false)">Find</button>
      <button title="Print (Ctrl/Cmd+P)" @click="print">Print</button>
      <button @click="save" title="Ctrl/Cmd+S">Download</button>
    </div>

    <div v-if="doc.deletedAt" class="banner info" role="status">
      <span><strong>This document is in the Trash.</strong> Restore it to keep it in your list.</span>
      <span class="banner-actions">
        <button class="primary" @click="restoreDoc(doc.id)">Restore</button>
      </span>
    </div>

    <div v-if="status === 'error'" class="banner" role="alert">
      <span>
        <strong>Not saved.</strong> Your browser's storage is full or unavailable, so these changes
        will be lost when you close this tab. Download a copy, or free space by deleting other
        documents and emptying the Trash.
      </span>
      <span class="banner-actions">
        <button class="primary" @click="save">Download</button>
        <button @click="retryFailed">Try again</button>
      </span>
    </div>

    <FindBar
      v-if="findOpen"
      ref="findBar"
      v-model:replace="replaceOpen"
      :target="textarea"
      :text="content"
      @close="closeFind"
      @edited="updateCursor"
      @highlight="(m) => (highlight = m)"
    />

    <div class="pane" :class="{ 'preview-on': previewOn }" :style="{ fontSize: prefs.fontSize + 'px' }">
      <div class="source">
      <!-- Line numbers can't line up with wrapped lines, so hide them then;
           the status bar still shows the line and column. -->
      <pre v-if="!view.wrap" ref="gutter" class="gutter" aria-hidden="true"><span v-for="n in lineCount" :key="n">{{ n }}
</span></pre>
      <textarea
        ref="textarea"
        v-model="content"
        :class="{ wrap: view.wrap }"
        :spellcheck="view.spellcheck"
        :wrap="view.wrap ? 'soft' : 'off'"
        autofocus
        aria-label="Document text"
        @keydown="onTextareaKeydown"
        @keyup="updateCursor"
        @click="updateCursor"
        @select="updateCursor"
        @scroll="syncScroll"
        @focus="textareaFocused = true"
        @blur="textareaFocused = false"
      />
      </div>
      <div v-if="markStyle" class="match-mark" :style="markStyle" aria-hidden="true" />
      <!-- Rendered by marked and sanitised by DOMPurify (see markdown.js). -->
      <article v-if="previewOn" class="preview markdown" aria-label="Preview" v-html="previewHtml" />
    </div>

    <!-- What gets printed: the whole text (a textarea only prints what's visible). -->
    <div class="print-copy" aria-hidden="true">
      <article v-if="previewOn" class="markdown" v-html="previewHtml" />
      <pre v-else :class="{ wrap: view.wrap }">{{ content }}</pre>
    </div>

    <footer class="status">
      <span>Ln {{ cursor.line }}, Col {{ cursor.col }}</span>
      <span class="status-controls">
        <select v-model="encoding" aria-label="Encoding used when downloading" title="Encoding">
          <option v-for="[v, label] in encodingOptions" :key="v" :value="v">{{ label }}</option>
        </select>
        <select v-model="eol" aria-label="Line endings used when downloading" title="Line endings">
          <option v-for="(label, v) in EOLS" :key="v" :value="v">{{ label }}</option>
        </select>
        <span class="font-size" role="group" aria-label="Text size">
          <button class="mini" aria-label="Smaller text" title="Smaller text" @click="stepFontSize(-1)">A−</button>
          <span aria-live="polite">{{ prefs.fontSize }}px</span>
          <button class="mini" aria-label="Larger text" title="Larger text" @click="stepFontSize(1)">A+</button>
        </span>
      </span>
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
