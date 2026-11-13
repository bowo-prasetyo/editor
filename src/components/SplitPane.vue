<script setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { keymap } from '@codemirror/view'
import { search, searchKeymap } from '@codemirror/search'
import { getDoc, state, updateDoc } from '../store'
import { prefs } from '../prefs'
import { createEditor } from '../cm'
import { viewSettings } from '../filetype'
import { effectiveIndent } from '../indentation'
import { findLanguage, loadLanguage } from '../languages'
import { displayName } from '../naming'
import { liveTabs } from '../session'
import { saveDoc } from '../fileaccess'
import { showToast } from '../toast'
import { whitespaceFix } from '../textops'
import { docEditorConfig, editedInOtherPane, helpOptions, keysFor, noteEdit, saveFixes } from '../editorsetup'

// The right-hand pane of a split: another document, or the same one, edited
// side by side. Edits show in both panes; each pane undoes its own typing.
// Ctrl/Cmd+S saves this pane's document, Ctrl/Cmd+F searches in it.
const props = defineProps({ id: { type: String, required: true } })
const emit = defineEmits(['close'])

const doc = computed(() => getDoc(props.id))
const host = ref(null)
const editor = shallowRef(null)
let editorFor = null
const current = () => (editorFor === props.id ? editor.value : null)

// The documents it can show: open tabs first, then the rest by name.
const choices = computed(() => {
  const tabs = liveTabs()
  const rest = state.docs
    .filter((d) => !d.deletedAt && !tabs.includes(d.id))
    .sort((a, b) => displayName(a.name).localeCompare(displayName(b.name)))
  const label = (d) => (d.folder ? `${displayName(d.name)} — ${d.folder}` : displayName(d.name))
  return {
    tabs: tabs.map(getDoc).filter(Boolean).map((d) => ({ id: d.id, label: label(d) })),
    rest: rest.map((d) => ({ id: d.id, label: label(d) })),
  }
})
const chosen = computed({ get: () => props.id, set: (id) => (prefs.split = id) })

const name = computed(() => doc.value?.name ?? '')
const view = computed(() => viewSettings(doc.value, { wrapProse: prefs.wrapProse, wrapCode: prefs.wrapCode }))
const config = ref(null)
const indent = computed(() =>
  effectiveIndent({ ...doc.value, content: doc.value?.content ?? '' }, { config: config.value, fallback: prefs.indentDefault }),
)
const language = computed(() => findLanguage(name.value, doc.value?.language))
const codeLoaded = ref(false)
const help = computed(() => helpOptions({ code: codeLoaded.value, name: name.value, language: language.value?.name }))
const keys = shallowRef(null)

function mount() {
  editor.value?.destroy()
  editor.value = null
  if (!host.value || !doc.value) return
  editorFor = props.id
  codeLoaded.value = false
  editor.value = createEditor({
    parent: host.value,
    text: doc.value.content,
    name: name.value,
    wrap: view.value.wrap,
    spellcheck: view.value.spellcheck,
    indent: indent.value,
    help: help.value,
    keys: keys.value,
    extra: [search({ top: true }), keymap.of(searchKeymap)],
    onChange: (text) => {
      noteEdit(props.id, text, 'split')
      if (text !== doc.value?.content) updateDoc(props.id, { content: text })
    },
  })
}
watch([host, () => props.id], mount, { flush: 'post' })

watch(
  () => doc.value?.content,
  (text) => text != null && current()?.setText(text, { history: !editedInOtherPane(props.id, text, 'split') }),
)
watch(() => view.value.wrap, (on) => current()?.setWrap(on))
watch(() => view.value.spellcheck, (on) => current()?.setSpellcheck(on))
watch(indent, (i) => current()?.setIndent(i))
watch(help, (h) => current()?.setHelpers(h))
watch(
  [() => props.id, () => prefs.editorConfig],
  async () => {
    const id = props.id
    const c = await docEditorConfig(doc.value)
    if (id === props.id) config.value = c
  },
  { immediate: true },
)
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
let loads = 0
watch(
  [language, editor],
  async ([desc, ed]) => {
    if (!ed) return
    const n = ++loads
    const support = await loadLanguage(desc)
    if (n !== loads || editor.value !== ed) return
    const code = !!support && desc?.name !== 'Markdown'
    ed.setLanguage(name.value, support, { smart: code })
    codeLoaded.value = code
  },
  { immediate: true },
)

// The document went away (deleted, or in the Trash): close the pane.
watch(
  () => !doc.value || !!doc.value.deletedAt,
  (gone) => gone && emit('close'),
  { immediate: true },
)

// Keys that mean "this pane" when typing here, not the main editor's.
let saving = false
async function onKeydown(e) {
  const mod = e.ctrlKey || e.metaKey
  if (!mod || e.altKey) return
  const key = e.key.toLowerCase()
  if (key === 's') {
    e.preventDefault()
    e.stopPropagation()
    if (saving) return
    saving = true
    try {
      const { trim, finalNewline } = saveFixes(doc.value, config.value)
      if (trim || finalNewline) current()?.apply(whitespaceFix({ trim, finalNewline }))
      const r = await saveDoc(getDoc(props.id), { saveAs: e.shiftKey })
      if (r.result === 'saved') showToast(`Saved to “${r.name}”.`, { timeout: 3000 })
    } catch (err) {
      showToast(`Couldn't save the file: ${err.message}`, { timeout: 10000 })
    } finally {
      saving = false
    }
  } else if (!e.shiftKey && (key === 'f' || key === 'h' || key === 'g')) {
    // CodeMirror's search panel handles these here.
    e.stopPropagation()
  }
}

onBeforeUnmount(() => editor.value?.destroy())
defineExpose({ focus: () => editor.value?.focus() })
</script>

<template>
  <div class="split-pane" @keydown="onKeydown">
    <div class="split-head">
      <select v-model="chosen" aria-label="Document shown in the right-hand pane" title="Document shown here">
        <optgroup v-if="choices.tabs.length" label="Open tabs">
          <option v-for="d in choices.tabs" :key="d.id" :value="d.id">{{ d.label }}</option>
        </optgroup>
        <optgroup v-if="choices.rest.length" label="Other documents">
          <option v-for="d in choices.rest" :key="d.id" :value="d.id">{{ d.label }}</option>
        </optgroup>
      </select>
      <span v-if="doc?.linked && doc.diskDirty" class="split-dirty" title="Changes not saved to the file (Ctrl/Cmd+S)">●</span>
      <span class="spacer" />
      <button class="mini" title="Close the split (Ctrl/Cmd+\)" aria-label="Close the split" @click="emit('close')">×</button>
    </div>
    <div ref="host" class="source" />
  </div>
</template>
