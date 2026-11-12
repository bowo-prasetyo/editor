<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  state,
  getDoc,
  updateDoc,
  setDocOptions,
  flushAll,
  retryFailed,
  restoreDoc,
} from '../store'
import { extension, viewSettings } from '../filetype'
import { ENCODINGS, EOLS } from '../textcodec'
import { prefs, stepFontSize } from '../prefs'
import { showToast } from '../toast'
import { canSaveInPlace, saveDoc } from '../fileaccess'
import { countWords } from '../stats'
import { createEditor } from '../cm'
import FindBar from '../components/FindBar.vue'
import GoToBar from '../components/GoToBar.vue'

const props = defineProps({ id: { type: String, required: true } })

const doc = computed(() => getDoc(props.id))
const host = ref(null) // where the editor is mounted
const editor = ref(null) // see createEditor() in cm.js
const cursor = ref({ line: 1, col: 1, cursors: 1, selected: 0, lines: 1 })

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

// Changing how the file is written makes it differ from the file on disk.
const diskChange = () => (doc.value?.linked ? { diskDirty: true } : {})
const encoding = computed({
  get: () => (doc.value?.encoding ?? 'utf-8') + (doc.value?.bom ? '+bom' : ''),
  set: (v) => {
    const [enc, bom] = v.split('+')
    setDocOptions(props.id, { encoding: enc, bom: bom === 'bom', ...diskChange() })
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
  set: (v) => setDocOptions(props.id, { eol: v, ...diskChange() }),
})

// Save writes back to the file the document came from where the browser
// allows it (Chrome, Edge); elsewhere it downloads a copy.
const inPlace = canSaveInPlace()
const fileStatus = computed(() => {
  if (!doc.value?.linked) return ''
  return doc.value.diskDirty ? 'Not saved to file' : 'Saved to file'
})
let saving = false
async function save(saveAs = false) {
  if (saving) return
  saving = true
  try {
    const encodingBefore = ENCODINGS[doc.value.encoding] ?? doc.value.encoding
    const r = await saveDoc(doc.value, { saveAs })
    if (r.result === 'saved') showToast(`Saved to “${r.name}”.`, { timeout: 3000 })
    if (r.lossy) {
      showToast(
        `Some characters can't be written as ${encodingBefore}, so this copy was saved as UTF-8.`,
        { timeout: 10000 },
      )
    }
  } catch (e) {
    console.error(e)
    showToast(`Couldn't save the file: ${e.message}`, { timeout: 10000 })
  } finally {
    saving = false
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

// The print copy holds the whole text, so it's only rendered while printing
// (keeping it up to date on every keystroke is slow for big documents).
const printing = ref(false)
const beforePrint = () => (printing.value = true)
const afterPrint = () => (printing.value = false)
async function print() {
  await updatePreview()
  printing.value = true
  await nextTick()
  window.print()
}


// --- The editor ---------------------------------------------------------------

// One CodeMirror editor per document; rebuilt when the route moves to
// another document (so undo history doesn't leak between documents).
function mountEditor() {
  editor.value?.destroy()
  editor.value = null
  if (!host.value || !doc.value) return
  editor.value = createEditor({
    parent: host.value,
    text: content.value,
    name: name.value,
    wrap: view.value.wrap,
    spellcheck: view.value.spellcheck,
    onChange: (text) => (content.value = text),
    onSelection: (info) => (cursor.value = info),
  })
  editor.value.focus()
}
watch([host, () => props.id], mountEditor, { flush: 'post' })

// Keep the editor in step with the document and its settings.
watch(content, (text) => editor.value?.setText(text))
watch(() => view.value.wrap, (on) => editor.value?.setWrap(on))
watch(() => view.value.spellcheck, (on) => editor.value?.setSpellcheck(on))
watch(name, (n) => editor.value?.setName(n))
watch(
  () => prefs.fontSize,
  () => nextTick(() => editor.value?.view.requestMeasure()),
)

// --- Counts -----------------------------------------------------------------

const lineCount = computed(() => cursor.value.lines)
const selectionInfo = computed(() => {
  const { cursors, selected } = cursor.value
  if (cursors > 1) return `${cursors} cursors`
  return selected ? `${selected} selected` : ''
})

// Words and characters: immediate for normal documents; for big ones,
// counted once typing pauses.
const BIG = 200_000
const stats = ref({ words: 0, chars: 0 })
let statsTimer
function updateStats() {
  stats.value = { words: countWords(content.value), chars: content.value.length }
}
let statsFor = null // the document the counts belong to
watch(
  content,
  (text) => {
    clearTimeout(statsTimer)
    // Right away for a newly opened document; for big ones, after typing pauses.
    if (text.length < BIG || statsFor !== props.id) updateStats()
    else statsTimer = setTimeout(updateStats, 500)
    statsFor = props.id
  },
  { immediate: true },
)

// --- Find / replace and go to line -------------------------------------------

const findOpen = ref(false)
const replaceOpen = ref(false)
const findBar = ref(null)
const goToOpen = ref(false)

async function openFind(withReplace) {
  goToOpen.value = false
  findOpen.value = true
  await nextTick()
  findBar.value?.open(withReplace)
}

function closeFind() {
  findOpen.value = false
  replaceOpen.value = false
  editor.value?.focus()
}

function openGoTo() {
  findOpen.value = false
  goToOpen.value = true
}

function closeGoTo({ refocus = true } = {}) {
  goToOpen.value = false
  if (refocus) editor.value?.focus()
}

// --- Keyboard ---------------------------------------------------------------

// Editor-wide shortcuts, wherever focus is on the page. Editing keys
// (Tab, Ctrl/Cmd+/, Alt+arrows…) are handled by the editor itself.
function onWindowKeydown(e) {
  if (!doc.value) return
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  if (mod && !e.altKey && key === 's') {
    e.preventDefault()
    save(e.shiftKey)
  } else if (mod && !e.altKey && !e.shiftKey && key === 'f') {
    e.preventDefault()
    openFind(false)
  } else if (mod && !e.altKey && !e.shiftKey && key === 'h') {
    e.preventDefault()
    openFind(true)
  } else if (mod && !e.altKey && !e.shiftKey && key === 'g') {
    e.preventDefault()
    openGoTo()
  } else if (e.altKey && !mod && e.code === 'KeyZ') {
    e.preventDefault()
    toggle('wrap')
  }
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('beforeprint', beforePrint)
  window.addEventListener('afterprint', afterPrint)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('beforeprint', beforePrint)
  window.removeEventListener('afterprint', afterPrint)
  clearTimeout(statsTimer)
  editor.value?.destroy()
  flushAll()
})
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
      <template v-if="inPlace">
        <button :title="doc.linked ? 'Save to the file (Ctrl/Cmd+S)' : 'Save to a file (Ctrl/Cmd+S)'" @click="save(false)">
          Save
        </button>
        <button title="Save to a different file (Ctrl/Cmd+Shift+S)" @click="save(true)">Save as…</button>
      </template>
      <button v-else title="Download a copy (Ctrl/Cmd+S)" @click="save(false)">Download</button>
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
        <button class="primary" @click="save(false)">{{ inPlace ? 'Save to a file' : 'Download' }}</button>
        <button @click="retryFailed">Try again</button>
      </span>
    </div>

    <FindBar
      v-if="findOpen"
      ref="findBar"
      v-model:replace="replaceOpen"
      :editor="editor"
      :text="content"
      @close="closeFind"
    />
    <GoToBar v-if="goToOpen" :editor="editor" :lines="lineCount" @close="closeGoTo" />

    <div class="pane" :class="{ 'preview-on': previewOn }" :style="{ fontSize: prefs.fontSize + 'px' }">
      <div ref="host" class="source" />
      <!-- Rendered by marked and sanitised by DOMPurify (see markdown.js). -->
      <article v-if="previewOn" class="preview markdown" aria-label="Preview" v-html="previewHtml" />
    </div>

    <!-- What gets printed: the whole text (the editor only draws what's visible). -->
    <div v-if="printing" class="print-copy" aria-hidden="true">
      <article v-if="previewOn" class="markdown" v-html="previewHtml" />
      <pre v-else :class="{ wrap: view.wrap }">{{ content }}</pre>
    </div>

    <footer class="status">
      <span>
        <button class="mini position" title="Go to line (Ctrl/Cmd+G)" @click="openGoTo">
          Ln {{ cursor.line }}, Col {{ cursor.col }}
        </button>
        <span v-if="selectionInfo"> ({{ selectionInfo }})</span>
      </span>
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
        {{ lineCount }} lines · {{ stats.words }} words · {{ stats.chars }} chars ·
        <span :class="['save', status]" aria-live="polite">{{ statusLabel }}</span>
        <template v-if="fileStatus">
          ·
          <span
            :class="['save', { error: doc.diskDirty }]"
            :title="doc.diskDirty ? 'Press Ctrl/Cmd+S to write your changes to the file' : 'The file on disk matches'"
          >{{ fileStatus }}</span>
        </template>
      </span>
    </footer>
  </section>

  <section v-else class="home">
    <p class="empty">Document not found. <RouterLink to="/">Back to documents</RouterLink></p>
  </section>
</template>
