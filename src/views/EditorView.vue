<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  state,
  getDoc,
  updateDoc,
  setDocOptions,
  moveToFolder,
  recordVersion,
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
import { AUTO, PLAIN, findLanguage, languageNames, loadLanguage } from '../languages'
import FindBar from '../components/FindBar.vue'
import GoToBar from '../components/GoToBar.vue'
import TabBar from '../components/TabBar.vue'
import FolderDialog from '../components/FolderDialog.vue'
import IndentMenu from '../components/IndentMenu.vue'
import HistoryPanel from '../components/HistoryPanel.vue'
import { convertIndentation, detectIndent, effectiveIndent } from '../indentation'
import { folderTree } from '../folders'
import { liveTabs, opened, saveSnapshot, takeSnapshot } from '../session'
import { cycleTab } from '../tabs'
import { useRouter } from 'vue-router'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()

const doc = computed(() => getDoc(props.id))
const host = ref(null) // where the editor is mounted
const editor = ref(null) // see createEditor() in cm.js
const cursor = ref({ line: 1, col: 1, cursors: 1, selected: 0, lines: 1 })

const content = computed({
  get: () => doc.value?.content ?? '',
  // Ignore the editor echoing back text it was just given (not an edit).
  set: (v) => v !== doc.value?.content && updateDoc(props.id, { content: v }),
})
const name = computed({
  get: () => doc.value?.name ?? '',
  set: (v) => updateDoc(props.id, { name: v }),
})

const view = computed(() => viewSettings(doc.value))
const isMarkdown = computed(() => ['md', 'markdown', 'mdown'].includes(extension(name.value)))
const historyOpen = ref(false)
// The history panel takes the preview's place while it's open.
const previewOn = computed(() => isMarkdown.value && !!doc.value?.preview && !historyOpen.value)
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
let editorFor = null // the document the current editor shows

// --- Indentation ----------------------------------------------------------------

// What the text suggests, worked out when the document is opened (not on
// every keystroke) or renamed, or when asked for in the menu.
const detectedIndent = ref({ type: 'spaces', size: 2, auto: true })
function detectIndentation() {
  detectedIndent.value = effectiveIndent({ name: name.value, content: content.value })
}
const indent = computed(() =>
  doc.value?.indent ? { ...doc.value.indent, auto: false } : detectedIndent.value,
)
watch(name, detectIndentation)
watch(indent, (i) => current()?.setIndent(i))

function setIndent(value) {
  if (!value) detectIndentation()
  setDocOptions(props.id, { indent: value ?? undefined })
}

// Re-indent the whole text (one undoable edit) and use that setting from now on.
function convertTo(type) {
  const found = detectIndent(content.value)
  const from = {
    type: found?.type ?? indent.value.type,
    size: found?.type === 'spaces' ? found.size : indent.value.size,
  }
  const to = { type, size: indent.value.size }
  const text = convertIndentation(content.value, from, to)
  if (text !== content.value) current()?.replace(0, content.value.length, text, { select: false })
  setDocOptions(props.id, { indent: { type, size: to.size } })
  showToast(text === content.value ? 'The indentation already matches.' : `Converted the indentation to ${type}.`)
}

// The editor, if it shows the current document. When the route moves to
// another document, watchers run before the editor is swapped: they must not
// push the new document's text or settings into the old one's editor.
const current = () => (editorFor === props.id ? editor.value : null)

// Switching documents keeps the old one's editor state (undo history,
// selection, scroll) for when its tab is shown again.
function mountEditor([, id] = [], [, oldId] = []) {
  if (editor.value && oldId && oldId !== id) saveSnapshot(oldId, editor.value.snapshot())
  editor.value?.destroy()
  editor.value = null
  if (!host.value || !doc.value) return
  opened(props.id, oldId !== props.id ? oldId : null)
  editorFor = props.id
  // Keep the text as it is when opened (if it changed since the newest
  // version), so edits made from here on can always be undone.
  if (content.value) recordVersion(props.id, 'auto')
  detectIndentation()
  editor.value = createEditor({
    indent: indent.value,
    saved: takeSnapshot(props.id),
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
watch(content, (text) => current()?.setText(text))
watch(() => view.value.wrap, (on) => current()?.setWrap(on))
watch(() => view.value.spellcheck, (on) => current()?.setSpellcheck(on))
// --- Language (syntax highlighting) --------------------------------------------

// Chosen from the file name, unless the user picked one in the status bar.
const languageChoice = computed({
  get: () => doc.value?.language ?? AUTO,
  set: (v) => setDocOptions(props.id, { language: v === AUTO ? undefined : v }),
})
// Very large files start as plain text: colouring them takes the browser a
// while. Picking a language in the status bar still turns it on.
const HIGHLIGHT_LIMIT = 5_000_000
const tooBig = computed(() => content.value.length > HIGHLIGHT_LIMIT)
const detected = computed(() =>
  tooBig.value ? 'Plain text (large file)' : (findLanguage(name.value)?.name ?? 'Plain text'),
)
const language = computed(() =>
  languageChoice.value === AUTO && tooBig.value ? null : findLanguage(name.value, languageChoice.value),
)
let languageLoads = 0
// Smart indentation on Enter for code; prose (Markdown) keeps the line's indentation.
const isCode = (desc, support) => !!support && desc?.name !== 'Markdown'
watch(
  [language, editor],
  async ([desc, ed]) => {
    if (!ed) return
    const load = ++languageLoads
    const support = await loadLanguage(desc)
    // Ignore a slow load that a newer choice (or another document) replaced.
    if (load === languageLoads && editor.value === ed) ed.setLanguage(name.value, support, { smart: isCode(desc, support) })
  },
  { immediate: true },
)
// Renaming can change the fallback comment syntax even if the language doesn't.
watch(name, async (n) => {
  const ed = current()
  const desc = language.value
  const support = await loadLanguage(desc)
  if (ed && ed === current()) ed.setLanguage(n, support, { smart: isCode(desc, support) })
})
watch(
  () => prefs.fontSize,
  () => nextTick(() => editor.value?.view.requestMeasure()),
)

// --- Folder -----------------------------------------------------------------

const moving = ref(false)
const folderPaths = computed(() =>
  folderTree(
    state.docs.filter((d) => !d.deletedAt),
    prefs.folders,
  ).map((f) => f.path),
)
function onMove(path) {
  moving.value = false
  moveToFolder(props.id, path)
  if (path && !folderPaths.value.includes(path)) prefs.folders = [...prefs.folders, path]
  current()?.focus()
}

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
  } else if (e.altKey && !mod && (e.key === 'PageUp' || e.key === 'PageDown')) {
    // Alt+PageUp / Alt+PageDown: previous / next tab.
    e.preventDefault()
    const next = cycleTab(liveTabs(), props.id, e.key === 'PageUp' ? -1 : 1)
    if (next && next !== props.id) router.push({ name: 'edit', params: { id: next } })
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
  if (editor.value && doc.value) saveSnapshot(props.id, editor.value.snapshot())
  editor.value?.destroy()
  flushAll()
})
</script>

<template>
  <section v-if="doc" class="editor">
    <TabBar :active="id" />
    <div class="toolbar">
      <button
        class="folder-button"
        :class="{ empty: !doc.folder }"
        :title="doc.folder ? `In ${doc.folder} — move to another folder` : 'Move to a folder'"
        @click="moving = true"
      >
        📁<span v-if="doc.folder" class="folder-path">{{ doc.folder }}</span>
      </button>
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
      <button
        class="toggle"
        :aria-pressed="historyOpen"
        title="Earlier versions of this document"
        @click="historyOpen = !historyOpen"
      >
        History
      </button>
      <button title="Print the whole document" @click="print">Print</button>
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

    <div class="pane" :class="{ 'preview-on': previewOn || historyOpen }" :style="{ fontSize: prefs.fontSize + 'px' }">
      <div ref="host" class="source" />
      <!-- Rendered by marked and sanitised by DOMPurify (see markdown.js). -->
      <article v-if="previewOn" class="preview markdown" aria-label="Preview" v-html="previewHtml" />
      <HistoryPanel v-if="historyOpen" :doc="doc" @close="historyOpen = false; current()?.focus()" />
    </div>

    <!-- What gets printed: the whole text (the editor only draws what's visible). -->
    <div v-if="printing" class="print-copy" aria-hidden="true">
      <article v-if="previewOn" class="markdown" v-html="previewHtml" />
      <pre v-else :class="{ wrap: view.wrap }">{{ content }}</pre>
    </div>

    <FolderDialog
      v-if="moving"
      :title="`Move “${name || 'this document'}” to folder`"
      :initial="doc.folder ?? ''"
      confirm="Move"
      :folders="folderPaths"
      allow-empty
      @submit="onMove"
      @cancel="moving = false"
    />

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
        <select
          v-model="languageChoice"
          class="language"
          aria-label="Language for syntax highlighting"
          title="Language for syntax highlighting"
        >
          <option :value="AUTO" title="Chosen from the file name">{{ detected }} (auto)</option>
          <option :value="PLAIN">Plain text</option>
          <option v-for="n in languageNames" :key="n" :value="n">{{ n }}</option>
        </select>
        <IndentMenu :indent="indent" :detected="detectedIndent" @set="setIndent" @convert="convertTo" />
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
