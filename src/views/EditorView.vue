<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  state,
  getDoc,
  updateDoc,
  setDocOptions,
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
import { countWords, slowToCount } from '../stats'
import { formatNumber } from '../locale'
import { createEditor } from '../cm'
import { EditorView } from '@codemirror/view'
import { whitespaceFix } from '../textops'
import { docEditorConfig, editedInOtherPane, helpOptions, keysFor, noteEdit, saveFixes } from '../editorsetup'
import SplitPane from '../components/SplitPane.vue'
import { checkDoc, diskNotices, keepMine, reloadFromDisk } from '../livereload'
import { AUTO, PLAIN, findLanguage, languageNames, loadLanguage } from '../languages'
import FindBar from '../components/FindBar.vue'
import GoToBar from '../components/GoToBar.vue'
import TabBar from '../components/TabBar.vue'
import SaveToFolderDialog from '../components/SaveToFolderDialog.vue'
import { saveDraftToFolder, saveTargets, togglePin, undoSaveToFolder } from '../drafts'
import { headings, toggleBold, toggleItalic } from '../mdedit'
import { displayName } from '../naming'
import { downloadedMessage } from '../platform'
import IndentMenu from '../components/IndentMenu.vue'
import ToolbarMenu from '../components/ToolbarMenu.vue'
import HistoryPanel from '../components/HistoryPanel.vue'
import UnreadFile from '../components/UnreadFile.vue'
import { convertIndentation, detectIndent, effectiveIndent } from '../indentation'
import { liveTabs, opened, saveSnapshot, takeSnapshot } from '../session'
import { closeDocTab } from '../closetab'
import { registerCommands, ui } from '../commands'
import { cycleTab } from '../tabs'
import { keyLabel } from '../keys'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const route = useRoute()

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

const view = computed(() => viewSettings(doc.value, { wrapProse: prefs.wrapProse, wrapCode: prefs.wrapCode }))
const isMarkdown = computed(() => ['md', 'markdown', 'mdown'].includes(extension(name.value)))
const historyOpen = ref(false)
// The history panel takes the preview's place while it's open.
const previewOn = computed(() => isMarkdown.value && !!doc.value?.preview && !historyOpen.value)
const toggle = (key) => setDocOptions(props.id, { [key]: !view.value[key] })

// Two kinds of saving: to the browser (every edit, automatically) and to the
// file on disk (Ctrl/Cmd+S). For a draft only the first exists. For a file,
// only the file can be "saved": the browser part just says that edits not
// yet written to the file are safe, so the status never reads "Saved" while
// the file is out of date.
const status = computed(() => state.status[props.id])
const saveKey = keyLabel('Mod+S')
const browserLabel = computed(() => {
  if (status.value === 'error') return 'Not saved'
  if (!doc.value?.linked) return { saved: 'Saved ✓', pending: 'Saving…' }[status.value] ?? ''
  if (!doc.value.diskDirty) return ''
  return { saved: 'Edits kept in browser ✓', pending: 'Keeping edits in browser…' }[status.value] ?? ''
})
const browserTitle = computed(() =>
  status.value === 'error'
    ? "Your browser's storage is full or unavailable"
    : doc.value?.linked
      ? 'Changes not yet saved to the file are kept in this browser, so a reload or crash loses nothing'
      : 'Kept in this browser',
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
// A file that mixes line endings shows "Mixed" (each line keeps its own;
// new lines get the most common one). Picking one ending converts every line.
const MIXED = 'mixed'
const eol = computed({
  get: () => (doc.value?.lineEnds ? MIXED : doc.value?.eol ?? '\n'),
  set: (v) => v !== MIXED && setDocOptions(props.id, { eol: v, lineEnds: null, ...diskChange() }),
})

// Save writes back to the file the document came from where the browser
// allows it (Chrome, Edge); elsewhere it downloads a copy.
const inPlace = canSaveInPlace()
// A file's state: 'deleted' (not on disk any more), 'dirty' (changes not
// saved to it) or 'saved'; '' for a draft. What's shown for each is below.
const fileState = computed(() => {
  if (!doc.value?.linked) return ''
  if (diskNotices[props.id]?.kind === 'deleted') return 'deleted'
  return doc.value.diskDirty ? 'dirty' : 'saved'
})
const FILE_STATUS = {
  deleted: { text: 'File not on disk', title: () => 'The file was deleted or moved: Save asks where to save' },
  dirty: { text: 'Not saved to file', title: () => `Press ${saveKey} to write your changes to the file` },
  saved: { text: 'Saved to file', title: () => 'The file on disk matches' },
}
let saving = false
async function save(saveAs = false) {
  if (saving || doc.value?.unread) return
  saving = true
  try {
    fixWhitespace()
    const encodingBefore = ENCODINGS[doc.value.encoding] ?? doc.value.encoding
    const r = await saveDoc(doc.value, { saveAs })
    if (r.result === 'saved') showToast(`Saved to “${r.name}”.`, { timeout: 3000 })
    // Firefox, Safari: say where the copy went, so nobody wonders whether their file changed.
    if (r.result === 'downloaded' && !r.lossy) showToast(downloadedMessage(r.name), { timeout: 6000 })
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

// Before writing a file: trailing spaces and the final line break, if
// Settings or the project's .editorconfig say so. In Markdown, two spaces at
// the end of a line are a line break, so they stay. Undoable like any edit.
function fixWhitespace() {
  const { trim, finalNewline } = saveFixes(doc.value, projectConfig.value)
  if (!trim && !finalNewline) return
  current()?.apply(whitespaceFix({ trim, finalNewline }))
}

// --- The file changed on disk (see livereload.js) ------------------------------------

// Shown a document: catch up with its file (changes made while it wasn't watched).
watch(() => props.id, (id) => checkDoc(id).catch(() => {}), { immediate: true })
const diskNotice = computed(() => diskNotices[props.id] ?? null)
async function onReloadFromDisk() {
  try {
    if (await reloadFromDisk(props.id)) showToast('Reloaded from disk. Your text was kept as a version (see History).', { timeout: 5000 })
  } catch (e) {
    showToast(`Couldn't read the file: ${e.message}`)
  }
}

// --- The project's .editorconfig (documents opened from a folder) ------------------

const projectConfig = ref(null)
async function loadProjectConfig() {
  const id = props.id
  const config = await docEditorConfig(doc.value)
  if (id !== props.id) return // moved to another document meanwhile
  projectConfig.value = config
  detectIndentation()
}
watch([() => props.id, () => prefs.editorConfig], loadProjectConfig, { immediate: true })

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
  detectedIndent.value = effectiveIndent(
    { name: name.value, content: content.value },
    { config: projectConfig.value, fallback: prefs.indentDefault },
  )
}
watch(() => prefs.indentDefault, detectIndentation, { deep: true })
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
    help: help.value,
    keys: keys.value,
    onChange: (text) => {
      noteEdit(props.id, text, 'main')
      content.value = text
    },
    onSelection: (info) => (cursor.value = info),
  })
  editor.value.focus()
}
watch([host, () => props.id], mountEditor, { flush: 'post' })

// Opened at a place (from search: ?at=from-to): select it, then tidy the URL.
watch(
  [editor, () => route.query.at],
  ([ed, at]) => {
    if (!ed || typeof at !== 'string' || editorFor !== props.id) return
    const m = /^(\d+)-(\d+)$/.exec(at)
    if (m) {
      const len = content.value.length
      ed.select(Math.min(+m[1], len), Math.min(+m[2], len), { focus: true })
      ed.view.dispatch({ effects: EditorView.scrollIntoView(Math.min(+m[1], len), { y: 'center' }) })
    }
    router.replace({ name: 'edit', params: { id: props.id } })
  },
  { flush: 'post' },
)

// Keep the editor in step with the document and its settings.
// An edit typed in the other pane of a split stays out of this pane's undo
// history (it's undone there).
watch(content, (text) => current()?.setText(text, { history: !editedInOtherPane(props.id, text, 'main') }))
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
    if (load === languageLoads && editor.value === ed) {
      ed.setLanguage(name.value, support, { smart: isCode(desc, support) })
      codeLoaded.value = isCode(desc, support)
    }
  },
  { immediate: true },
)

// Completion, closing brackets and indentation guides: for code, unless
// turned off (see helpers() in cm.js). Suggestions are always available with
// Ctrl+Space.
const codeLoaded = ref(false)
const help = computed(() => helpOptions({ code: codeLoaded.value, name: name.value, language: language.value?.name }))
watch(help, (h) => current()?.setHelpers(h))

// Vim keys, if chosen in Settings (loaded when first needed).
const keys = shallowRef(null)
watch(
  () => prefs.keymap,
  async (mode) => {
    const ext = await keysFor(mode)
    if (mode !== prefs.keymap) return
    keys.value = ext
    editor.value?.setKeys(ext)
  },
  { immediate: true },
)

// --- Split: a second document (or the same one) side by side --------------------------

const splitOpen = computed(() => !!prefs.split && !!getDoc(prefs.split) && !getDoc(prefs.split).deletedAt)
function toggleSplit() {
  prefs.split = splitOpen.value ? null : props.id
}

// --- Narrow screens -----------------------------------------------------------
//
// Below 600px wide, the toolbar keeps the everyday buttons and moves the rest
// into a More menu (the same actions, from moreItems); the status bar folds
// its controls behind a ⋯ button. On touch screens, Markdown documents get
// Bold and Italic buttons (there's no Ctrl+B without a keyboard).
const moreItems = computed(() => [
  { id: 'wrap', label: 'Wrap long lines', checked: !!view.value.wrap, run: () => toggle('wrap') },
  { id: 'spelling', label: 'Underline spelling mistakes', checked: !!view.value.spellcheck, run: () => toggle('spellcheck') },
  { id: 'history', label: 'History', checked: historyOpen.value, run: () => (historyOpen.value = !historyOpen.value) },
  { id: 'print', label: 'Print', run: () => print() },
  ...(inPlace ? [{ id: 'saveAs', label: 'Save as…', run: () => save(true) }] : []),
])
const statusMore = ref(false)

// Messages (toasts) sit just above the status bar, however tall it wraps,
// so they never cover its controls: its height, as --status-h on the page.
const statusBar = ref(null)
let statusObserver = null
watch(statusBar, (el) => {
  statusObserver?.disconnect()
  statusObserver = null
  const root = document.documentElement.style
  if (!el) return root.removeProperty('--status-h')
  statusObserver = new ResizeObserver(() => root.setProperty('--status-h', `${el.offsetHeight}px`))
  statusObserver.observe(el)
})
onBeforeUnmount(() => {
  statusObserver?.disconnect()
  document.documentElement.style.removeProperty('--status-h')
})
// Keep the editor's focus (and the phone's keyboard) while formatting.
const format = (cmd) => {
  current()?.apply(cmd)
  current()?.focus()
}
const onOff = (on) => (on ? 'on' : 'off')
const flip = (key, label) => () => {
  prefs[key] = !prefs[key]
  showToast(`${label}: ${onOff(prefs[key])}.`, { timeout: 2500 })
}
// A command whose title says what it will do.
const setting = (id, key, label) => ({
  id,
  group: 'settings',
  get title() {
    return `${label}: turn ${onOff(!prefs[key])}`
  },
  run: flip(key, label),
})
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

// --- Save to folder (drafts; see drafts.js) -----------------------------------

// A draft can become a file in an open folder.
const isDraft = computed(() => doc.value && doc.value.kind !== 'file' && !doc.value.deletedAt)
const folderTargets = computed(() => (isDraft.value ? saveTargets() : []))
const savingTo = ref(null) // { error, busy } while the dialog is open
const openSaveToFolder = () => folderTargets.value.length && (savingTo.value = { error: '', busy: false })
async function onSaveToFolder({ rootId, path }) {
  savingTo.value = { error: '', busy: true }
  try {
    const saved = await saveDraftToFolder(props.id, rootId, path)
    savingTo.value = null
    const folder = folderTargets.value.find((f) => f.id === rootId)?.name ?? saveTargets().find((f) => f.id === rootId)?.name
    showToast(`Saved as “${saved.path}” in “${folder}”. It’s a file now, not a draft.`, {
      action: {
        label: 'Undo',
        run: async () => {
          const removed = await undoSaveToFolder(saved)
          showToast(removed ? 'It’s a draft again, and the file was removed.' : 'It’s a draft again. The file changed since, so it was kept.')
        },
      },
      timeout: 10000,
    })
    current()?.focus()
  } catch (e) {
    savingTo.value = { error: e.message, busy: false }
  }
}

// --- Counts -----------------------------------------------------------------

const lineCount = computed(() => cursor.value.lines)
const selectionInfo = computed(() => {
  const { cursors, selected } = cursor.value
  if (cursors > 1) return `${formatNumber(cursors)} cursors`
  return selected ? `${formatNumber(selected)} selected` : ''
})

// Words and characters: immediate for normal documents; for big ones,
// counted once typing pauses.
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
    if (!slowToCount(text) || statsFor !== props.id) updateStats()
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
    goToTab(e.key === 'PageUp' ? -1 : 1)
  } else if (mod && !e.altKey && !e.shiftKey && e.key === '\\') {
    // Ctrl/Cmd+\: split the editor, or close the split.
    e.preventDefault()
    toggleSplit()
  } else if (e.altKey && !mod && e.code === 'KeyZ') {
    e.preventDefault()
    toggle('wrap')
  }
}

// --- Commands (for the command palette) -------------------------------------

const nameInput = ref(null)
const edit = (name) => () => current()?.run(name)
function goToTab(step) {
  const next = cycleTab(liveTabs(), props.id, step)
  if (next && next !== props.id) router.push({ name: 'edit', params: { id: next } })
}
async function saveNamedVersion() {
  const label = prompt('Name this version (optional):', '')
  if (label === null) return
  await recordVersion(props.id, 'manual', label.trim())
  showToast('Version saved.')
}
const G = 'editor'
const E = 'editing'
let unregister = () => {}
const editorCommands = [
  { id: 'find', title: 'Find', group: G, shortcut: 'find', run: () => openFind(false) },
  { id: 'replace', title: 'Find and replace', group: G, shortcut: 'replace', run: () => openFind(true) },
  { id: 'goToLine', title: 'Go to line…', group: G, shortcut: 'goToLine', run: () => openGoTo() },
  { id: 'save', title: inPlace ? 'Save' : 'Download', group: G, shortcut: 'save', run: () => save(false) },
  { id: 'saveAs', title: 'Save as…', group: G, shortcut: 'saveAs', run: () => save(true), when: () => inPlace },
  { id: 'print', title: 'Print', group: G, run: () => print() },
  { id: 'rename', title: 'Rename document', group: G, run: () => nameInput.value?.select() },
  { id: 'saveToFolder', title: 'Save to folder…', group: G, when: () => folderTargets.value.length > 0, run: openSaveToFolder },
  { id: 'pin', title: 'Pin this draft to the top of the list', group: G, when: () => isDraft.value && !doc.value.pinned, run: () => togglePin(props.id) },
  { id: 'unpin', title: 'Unpin this draft', group: G, when: () => isDraft.value && !!doc.value.pinned, run: () => togglePin(props.id) },
  { id: 'wrap', title: 'Toggle word wrap', group: G, shortcut: 'wrap', run: () => toggle('wrap') },
  { id: 'spelling', title: 'Toggle spell check', group: G, run: () => toggle('spellcheck') },
  { id: 'preview', title: 'Toggle Markdown preview', group: G, when: () => isMarkdown.value, run: () => setDocOptions(props.id, { preview: !doc.value.preview }) },
  { id: 'history', title: 'Show version history', group: G, run: () => (historyOpen.value = true) },
  { id: 'saveVersion', title: 'Save a version now…', group: G, run: saveNamedVersion },
  { id: 'detectIndent', title: 'Indentation: detect from the file', group: G, run: () => setIndent(null) },
  { id: 'indentSpaces2', title: 'Indentation: 2 spaces', group: G, run: () => setIndent({ type: 'spaces', size: 2 }) },
  { id: 'indentSpaces4', title: 'Indentation: 4 spaces', group: G, run: () => setIndent({ type: 'spaces', size: 4 }) },
  { id: 'indentTabs', title: 'Indentation: tabs', group: G, run: () => setIndent({ type: 'tabs', size: indent.value.size }) },
  { id: 'convertSpaces', title: 'Convert indentation to spaces', group: G, run: () => convertTo('spaces') },
  { id: 'convertTabs', title: 'Convert indentation to tabs', group: G, run: () => convertTo('tabs') },
  { id: 'biggerText', title: 'Larger text', group: G, run: () => stepFontSize(1) },
  { id: 'smallerText', title: 'Smaller text', group: G, run: () => stepFontSize(-1) },
  { id: 'nextTab', title: 'Next tab', group: G, shortcut: 'nextTab', run: () => goToTab(1) },
  { id: 'prevTab', title: 'Previous tab', group: G, shortcut: 'prevTab', run: () => goToTab(-1) },
  {
    id: 'closeTab', title: 'Close tab', group: G,
    run: () => closeDocTab(router, props.id, props.id),
  },
  { id: 'toggleComment', title: 'Comment or uncomment lines', group: E, shortcut: 'toggleComment', run: edit('toggleComment') },
  { id: 'moveLineUp', title: 'Move lines up', group: E, shortcut: 'moveLineUp', run: edit('moveLineUp') },
  { id: 'moveLineDown', title: 'Move lines down', group: E, run: edit('moveLineDown') },
  { id: 'copyLineDown', title: 'Duplicate lines', group: E, shortcut: 'copyLineDown', run: edit('copyLineDown') },
  { id: 'deleteLine', title: 'Delete lines', group: E, shortcut: 'deleteLine', run: edit('deleteLine') },
  { id: 'selectNext', title: 'Add next occurrence to selection', group: E, shortcut: 'selectNext', run: edit('selectNextOccurrence') },
  { id: 'selectAll', title: 'Select all occurrences', group: E, shortcut: 'selectAll', run: edit('selectSelectionMatches') },
  { id: 'addCursorAbove', title: 'Add cursor above', group: E, run: edit('addCursorAbove') },
  { id: 'addCursorBelow', title: 'Add cursor below', group: E, run: edit('addCursorBelow') },
  { id: 'matchingBracket', title: 'Go to matching bracket', group: E, shortcut: 'matchingBracket', run: edit('cursorMatchingBracket') },
  { id: 'selectLine', title: 'Select line', group: E, shortcut: 'selectLine', run: edit('selectLine') },
  { id: 'indentLines', title: 'Indent lines', group: E, run: edit('indentMore') },
  { id: 'outdentLines', title: 'Outdent lines', group: E, run: edit('indentLess') },
  { id: 'sortAsc', title: 'Sort lines (A to Z)', group: E, run: edit('sortLinesAscending') },
  { id: 'sortDesc', title: 'Sort lines (Z to A)', group: E, run: edit('sortLinesDescending') },
  { id: 'sortCaseless', title: 'Sort lines, ignoring case', group: E, run: edit('sortLinesIgnoreCase') },
  { id: 'uniqueLines', title: 'Remove duplicate lines', group: E, run: edit('removeDuplicateLines') },
  { id: 'reverseLines', title: 'Reverse lines', group: E, run: edit('reverseLines') },
  { id: 'joinLines', title: 'Join lines', group: E, run: edit('joinLines') },
  { id: 'upperCase', title: 'Change case: UPPERCASE', group: E, run: edit('upperCase') },
  { id: 'lowerCase', title: 'Change case: lowercase', group: E, run: edit('lowerCase') },
  { id: 'titleCase', title: 'Change case: Title Case', group: E, run: edit('titleCase') },
  { id: 'trimWhitespace', title: 'Trim trailing whitespace', group: E, run: edit('trimTrailingWhitespace') },
  { id: 'foldAll', title: 'Fold all', group: E, shortcut: 'foldAll', run: edit('foldAll') },
  { id: 'unfoldAll', title: 'Unfold all', group: E, shortcut: 'foldAll', run: edit('unfoldAll') },
  { id: 'complete', title: 'Show suggestions', group: E, shortcut: 'complete', run: edit('startCompletion') },
  setting('prefCloseBrackets', 'closeBrackets', 'Auto-close brackets and quotes'),
  setting('prefAutocomplete', 'autocomplete', 'Suggestions while typing'),
  setting('prefIndentGuides', 'indentGuides', 'Indentation guides'),
  setting('prefTrimOnSave', 'trimOnSave', 'Trim trailing whitespace when saving to a file'),
  setting('prefFinalNewline', 'finalNewline', 'Add a final newline when saving to a file'),
  setting('prefLint', 'lint', 'Check JSON and YAML'),
  {
    id: 'prefVim', group: 'settings',
    get title() {
      return prefs.keymap === 'vim' ? 'Vim keys: turn off' : 'Vim keys: turn on'
    },
    run: () => {
      prefs.keymap = prefs.keymap === 'vim' ? 'standard' : 'vim'
      showToast(`Vim keys: ${prefs.keymap === 'vim' ? 'on' : 'off'}.`, { timeout: 2500 })
    },
  },
  {
    id: 'split', group: G, shortcut: 'split',
    get title() {
      return splitOpen.value ? 'Close the split' : 'Split the editor (side by side)'
    },
    run: toggleSplit,
  },
  { id: 'problems', title: 'Show problems (JSON, YAML)', group: E, shortcut: 'problems', run: edit('openLintPanel') },
  { id: 'nextProblem', title: 'Go to the next problem', group: E, shortcut: 'nextProblem', run: edit('nextDiagnostic') },
  { id: 'undo', title: 'Undo', group: E, shortcut: 'undo', run: edit('undo') },
  { id: 'redo', title: 'Redo', group: E, run: edit('redo') },
]

onMounted(() => {
  unregister = registerCommands(editorCommands)
  ui.selectedText = () => current()?.selectedText() ?? ''
  // Go to heading (Markdown): the quick switcher's "#" lists these.
  ui.headings = () => (isMarkdown.value && current() ? headings(current().view.state) : [])
  ui.goTo = (pos) => {
    const ed = current()
    if (!ed) return
    ed.select(pos, pos, { focus: true })
    ed.view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 40 }) })
  }
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('beforeprint', beforePrint)
  window.addEventListener('afterprint', afterPrint)
})
onBeforeUnmount(() => {
  unregister()
  ui.selectedText = null
  ui.headings = null
  ui.goTo = null
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
    <h1 class="sr-only">{{ displayName(name) }}</h1>
    <div class="toolbar">
      <span v-if="doc.kind === 'file' && doc.folder" class="folder-path" :title="`In ${doc.folder}`">{{ doc.folder }}</span>
      <input ref="nameInput" v-model="name" class="name" spellcheck="false" aria-label="File name" title="Rename" />
      <template v-if="isMarkdown">
        <button class="touch-only format" title="Bold (Ctrl/Cmd+B)" aria-label="Bold" @pointerdown.prevent @click="format(toggleBold)"><b>B</b></button>
        <button class="touch-only format" title="Italic (Ctrl/Cmd+I)" aria-label="Italic" @pointerdown.prevent @click="format(toggleItalic)"><i>I</i></button>
      </template>
      <button
        class="toggle wide-only"
        :aria-pressed="view.wrap"
        title="Wrap long lines (Alt+Z)"
        @click="toggle('wrap')"
      >
        Wrap
      </button>
      <button
        class="toggle wide-only"
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
        class="toggle wide-only"
        :aria-pressed="historyOpen"
        title="Earlier versions of this document"
        @click="historyOpen = !historyOpen"
      >
        History
      </button>
      <button
        class="toggle wide-only"
        :aria-pressed="splitOpen"
        title="Show a second document (or this one) side by side (Ctrl/Cmd+\)"
        @click="toggleSplit"
      >
        Split
      </button>
      <button class="wide-only" title="Print the whole document" @click="print">Print</button>
      <template v-if="inPlace">
        <button :title="doc.linked ? 'Save to the file (Ctrl/Cmd+S)' : 'Save to a file (Ctrl/Cmd+S)'" @click="save(false)">
          Save
        </button>
        <button class="wide-only" title="Save to a different file (Ctrl/Cmd+Shift+S)" @click="save(true)">Save as…</button>
        <button v-if="folderTargets.length" title="Save this draft as a file in an open folder" @click="openSaveToFolder">
          Save to folder…
        </button>
      </template>
      <button v-else title="Download a copy (Ctrl/Cmd+S)" @click="save(false)">Download</button>
      <ToolbarMenu class="narrow-only" label="More" title="More actions" :items="moreItems" />
    </div>

    <div v-if="doc.deletedAt" class="banner info" role="status">
      <span><strong>This document is in the Trash.</strong> Restore it to keep it in your list.</span>
      <span class="banner-actions">
        <button class="primary" @click="restoreDoc(doc.id)">Restore</button>
      </span>
    </div>

    <div v-if="diskNotice?.kind === 'changed'" class="banner notice" role="alert">
      <span v-if="doc.diskDirty">
        <strong>“{{ name }}” changed on disk</strong>, and you have changes not saved to it.
        Reload to take the file's text (yours is kept in History), or keep yours (Save will ask before replacing the file).
      </span>
      <span v-else><strong>“{{ name }}” changed on disk.</strong></span>
      <span class="banner-actions">
        <button class="primary" @click="onReloadFromDisk">Reload from disk</button>
        <button @click="keepMine(doc.id)">{{ doc.diskDirty ? 'Keep mine' : 'Not now' }}</button>
      </span>
    </div>
    <div v-else-if="diskNotice?.kind === 'deleted'" class="banner notice" role="status">
      <span>
        <strong>“{{ name }}” was deleted or moved on disk.</strong> Your text is still here; Save asks where to save it.
      </span>
      <span class="banner-actions">
        <button @click="keepMine(doc.id)">OK</button>
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

    <div class="pane" :class="{ 'preview-on': previewOn || historyOpen || splitOpen }" :style="{ fontSize: prefs.fontSize + 'px' }">
      <!-- A file's text is read from disk before the editor shows it. -->
      <UnreadFile v-if="doc.unread" :doc="doc" class="source" />
      <div v-else ref="host" class="source" />
      <SplitPane v-if="splitOpen" :id="prefs.split" @close="prefs.split = null; current()?.focus()" />
      <!-- Rendered by marked and sanitised by DOMPurify (see markdown.js). -->
      <article v-if="previewOn" class="preview markdown" aria-label="Preview" v-html="previewHtml" />
      <HistoryPanel v-if="historyOpen" :doc="doc" @close="historyOpen = false; current()?.focus()" />
    </div>

    <!-- What gets printed: the whole text (the editor only draws what's visible). -->
    <div v-if="printing" class="print-copy" aria-hidden="true">
      <article v-if="previewOn" class="markdown" v-html="previewHtml" />
      <pre v-else :class="{ wrap: view.wrap }">{{ content }}</pre>
    </div>

    <SaveToFolderDialog
      v-if="savingTo"
      :name="name || 'untitled.txt'"
      :folders="folderTargets"
      :error="savingTo.error"
      :busy="savingTo.busy"
      @submit="onSaveToFolder"
      @cancel="savingTo = null"
    />

    <footer ref="statusBar" class="status" :class="{ expanded: statusMore }">
      <span>
        <button class="mini position" title="Go to line (Ctrl/Cmd+G)" @click="openGoTo">
          Ln {{ cursor.line }}, Col {{ cursor.col }}
        </button>
        <span v-if="selectionInfo"> ({{ selectionInfo }})</span>
        <button
          class="mini narrow-only"
          :aria-expanded="statusMore"
          aria-controls="status-controls"
          :title="statusMore ? 'Hide the details' : 'Show encoding, line endings, language, indentation and text size'"
          :aria-label="statusMore ? 'Hide details' : 'Show details'"
          @click="statusMore = !statusMore"
        >⋯</button>
      </span>
      <span id="status-controls" class="status-controls">
        <select v-model="encoding" aria-label="Encoding used when downloading" title="Encoding">
          <option v-for="[v, label] in encodingOptions" :key="v" :value="v">{{ label }}</option>
        </select>
        <select v-model="eol" aria-label="Line endings used when downloading" title="Line endings">
          <option v-if="doc.lineEnds" :value="MIXED" :title="`Each line keeps its own ending; new lines get ${EOLS[doc.eol ?? '\n']}`">
            Mixed
          </option>
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
          <!-- Named by their (screen-reader) text, not aria-label, so the name
               a voice-control user reads off the screen still works. -->
          <button class="mini" title="Smaller text" @click="stepFontSize(-1)"><span aria-hidden="true">A−</span><span class="sr-only">Smaller text</span></button>
          <span aria-live="polite">{{ prefs.fontSize }}px</span>
          <button class="mini" title="Larger text" @click="stepFontSize(1)"><span aria-hidden="true">A+</span><span class="sr-only">Larger text</span></button>
        </span>
      </span>
      <span>
        <button
          v-if="cursor.problems"
          class="mini problems"
          title="Show the problems (Ctrl/Cmd+Shift+M; F8 goes to the next one)"
          @click="current()?.run('openLintPanel')"
        >⚠ {{ formatNumber(cursor.problems) }} problem{{ cursor.problems === 1 ? '' : 's' }}</button>
        <span class="status-counts">{{ formatNumber(lineCount) }} lines · {{ formatNumber(stats.words) }} words · {{ formatNumber(stats.chars) }} chars · </span>
        <!-- A file's own state comes first: it's the one that matters. -->
        <template v-if="fileState">
          <span
            :class="['save', 'file-status', { notice: fileState !== 'saved' }]"
            :title="FILE_STATUS[fileState].title()"
            aria-live="polite"
          >{{ FILE_STATUS[fileState].text }}</span>
          <template v-if="browserLabel"> · </template>
        </template>
        <span
          :class="['save', 'browser-status', status]"
          :data-state="status"
          :title="browserLabel ? browserTitle : undefined"
          aria-live="polite"
        >{{ browserLabel }}</span>
      </span>
    </footer>
  </section>

  <section v-else class="home">
    <p class="empty">Document not found. <RouterLink to="/">Back to documents</RouterLink></p>
  </section>
</template>
