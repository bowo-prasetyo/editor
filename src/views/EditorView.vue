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
import { indentEdit, outdentEdit } from '../indent'
import { extension, viewSettings } from '../filetype'
import { ENCODINGS, EOLS } from '../textcodec'
import { prefs, stepFontSize } from '../prefs'
import { showToast } from '../toast'
import { applyEdit, rangeRect } from '../textedit'
import { canSaveInPlace, saveDoc } from '../fileaccess'
import { countLines, countWords, lineColAt } from '../stats'
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

// --- Counts -----------------------------------------------------------------

const lineCount = computed(() => countLines(content.value))

// Words and characters: immediate for normal documents; for big ones,
// counted once typing pauses.
const BIG = 200_000
const stats = ref({ words: 0, chars: 0 })
let statsTimer
function updateStats() {
  stats.value = { words: countWords(content.value), chars: content.value.length }
}
watch(
  content,
  (text) => {
    clearTimeout(statsTimer)
    if (text.length < BIG) updateStats()
    else statsTimer = setTimeout(updateStats, 500)
  },
  { immediate: true },
)

function updateCursor() {
  const el = textarea.value
  if (!el) return
  cursor.value = lineColAt(el.value, el.selectionStart)
}

// --- Line numbers -------------------------------------------------------------

// Only the line numbers in view are drawn (a document can have 100,000
// lines), moved into place to follow the textarea's scrolling.
const scrollTop = ref(0)
const viewHeight = ref(0)
const lineHeight = ref(22.4)
const padTop = ref(12)
let measuredAt = 0 // line count when the line pitch was last measured
function measure() {
  const el = textarea.value
  if (!el) return
  const cs = getComputedStyle(el)
  const css = parseFloat(cs.lineHeight) || prefs.fontSize * 1.6
  padTop.value = parseFloat(cs.paddingTop) || 0
  viewHeight.value = el.clientHeight
  // Browsers lay lines out on a sub-pixel grid (22.4px becomes 22.390625px in
  // Chrome), which adds up over thousands of lines. Measure the real pitch
  // from the text's height when there are enough lines to do so accurately.
  const lines = lineCount.value
  const exact = (el.scrollHeight - padTop.value - (parseFloat(cs.paddingBottom) || 0)) / lines
  lineHeight.value = lines >= 50 && Math.abs(exact - css) < 0.5 ? exact : css
  measuredAt = lines
}
// Measure again as a document grows (cheap: only when the line count doubles).
watch(lineCount, (n) => {
  if (n >= 50 && n >= measuredAt * 2) nextTick(measure)
})
const firstLine = computed(() =>
  Math.min(lineCount.value - 1, Math.max(0, Math.floor((scrollTop.value - padTop.value) / lineHeight.value))),
)
const gutterLines = computed(() => {
  const count = Math.ceil(viewHeight.value / lineHeight.value) + 2
  const end = Math.min(lineCount.value, firstLine.value + count)
  const out = []
  for (let n = firstLine.value + 1; n <= end; n++) out.push(n)
  return out
})
const gutterStyle = computed(() => ({
  transform: `translateY(${padTop.value + firstLine.value * lineHeight.value - scrollTop.value}px)`,
}))
const gutterWidth = computed(() => `calc(${Math.max(2, String(lineCount.value).length)}ch + 20px)`)
let resizeObserver
watch(() => prefs.fontSize, () => nextTick(measure))

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
    save(e.shiftKey)
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

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('beforeprint', beforePrint)
  window.addEventListener('afterprint', afterPrint)
  measure()
  if (typeof ResizeObserver !== 'undefined' && textarea.value) {
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(textarea.value)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('beforeprint', beforePrint)
  window.removeEventListener('afterprint', afterPrint)
  resizeObserver?.disconnect()
  clearTimeout(statsTimer)
  flushAll()
})

function syncScroll(e) {
  scrollTop.value = e.target.scrollTop
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
      <div v-if="!view.wrap" class="gutter" :style="{ width: gutterWidth }" aria-hidden="true">
        <div class="gutter-lines" :style="gutterStyle">
          <div v-for="n in gutterLines" :key="n">{{ n }}</div>
        </div>
      </div>
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
    <div v-if="printing" class="print-copy" aria-hidden="true">
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
