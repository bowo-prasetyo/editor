<script>
// Remembered across openings of the find bar, like in most editors.
const last = { query: '', replacement: '', matchCase: false, wholeWord: false }
</script>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { findMatches, nextMatchIndex, prevMatchIndex, replaceAllEdit } from '../find'

// Find (and optionally replace) in the editor. Every match is highlighted;
// the current one is selected.
const props = defineProps({
  editor: { type: Object, default: null }, // see createEditor() in cm.js
  text: { type: String, required: true },
})
const emit = defineEmits(['close'])
const showReplace = defineModel('replace', { type: Boolean, default: false })

const query = ref(last.query)
const replacement = ref(last.replacement)
const matchCase = ref(last.matchCase)
const wholeWord = ref(last.wholeWord)
watch([query, replacement, matchCase, wholeWord], ([q, r, c, w]) =>
  Object.assign(last, { query: q, replacement: r, matchCase: c, wholeWord: w }),
)
const current = ref(-1)
const message = ref('')
const queryInput = ref(null)
const replaceInput = ref(null)
let anchor = 0 // where the search started, for find-as-you-type

const matches = computed(() =>
  findMatches(props.text, query.value, { matchCase: matchCase.value, wholeWord: wholeWord.value }),
)

const count = computed(() => {
  if (message.value) return message.value
  if (!query.value) return ''
  if (!matches.value.length) return 'No results'
  return current.value >= 0 ? `${current.value + 1} of ${matches.value.length}` : `${matches.value.length} found`
})

const selection = () => props.editor?.getSelection() ?? { from: 0, to: 0 }

// Select match i in the editor and scroll it into view, keeping focus in
// the find bar.
function select(i) {
  current.value = i
  if (!props.editor || i < 0) return
  const [s, e] = matches.value[i]
  props.editor.select(s, e)
}

function isSelected(i) {
  const m = matches.value[i]
  const { from, to } = selection()
  return !!m && from === m[0] && to === m[1]
}

// Highlight every match in the editor while the bar is open.
watch(
  [query, matchCase, wholeWord, () => props.editor],
  ([q, c, w, ed]) => ed?.highlight(q, { matchCase: c, wholeWord: w }),
  { immediate: true },
)
onBeforeUnmount(() => props.editor?.highlight('', {}))

// Find as you type: jump to the first match after where the search started.
watch([query, matchCase, wholeWord], () => {
  message.value = ''
  if (query.value) select(nextMatchIndex(matches.value, anchor))
  else current.value = -1
})

// Keep the counter honest when the text changes under us.
watch(matches, (list) => {
  if (current.value >= list.length || !isSelected(current.value)) {
    const { from, to } = selection()
    current.value = list.findIndex(([s, e]) => s === from && e === to)
  }
})

function next() {
  message.value = ''
  const from = isSelected(current.value) ? matches.value[current.value][0] + 1 : selection().from
  select(nextMatchIndex(matches.value, from))
}

function prev() {
  message.value = ''
  const from = isSelected(current.value) ? matches.value[current.value][0] : selection().from
  select(prevMatchIndex(matches.value, from))
}

// The text prop only catches up on the next render, so edits read the
// editor's own text.
const liveMatches = () =>
  findMatches(props.editor.getText(), query.value, { matchCase: matchCase.value, wholeWord: wholeWord.value })

async function replaceOne() {
  if (!props.editor || !matches.value.length) return
  if (!isSelected(current.value)) return next()
  const [s, e] = matches.value[current.value]
  props.editor.replace(s, e, replacement.value)
  await nextTick()
  select(nextMatchIndex(liveMatches(), s + replacement.value.length))
}

async function replaceAll() {
  if (!props.editor) return
  const edit = replaceAllEdit(props.editor.getText(), liveMatches(), replacement.value)
  if (!edit) return
  props.editor.replace(edit.from, edit.to, edit.insert)
  await nextTick()
  current.value = -1
  message.value = `Replaced ${edit.count}`
}

function close() {
  emit('close')
}

function onQueryKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    e.shiftKey ? prev() : next()
  }
}

function onReplaceKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    e.ctrlKey || e.metaKey ? replaceAll() : replaceOne()
  }
}

// Called by the editor on Ctrl+F / Ctrl+H: seed the query from a one-line
// selection and focus the right box.
async function open(withReplace) {
  if (withReplace) showReplace.value = true
  if (props.editor) {
    const { from, to } = selection()
    anchor = from
    const sel = props.editor.getText().slice(from, to)
    if (sel && !sel.includes('\n')) query.value = sel
  }
  await nextTick()
  if (query.value && current.value < 0) select(nextMatchIndex(matches.value, anchor))
  const input = withReplace && query.value ? replaceInput.value : queryInput.value
  input?.focus()
  input?.select()
}

defineExpose({ open })
</script>

<template>
  <div class="findbar" role="search" @keydown.esc.prevent="close">
    <div class="find-row">
      <input
        ref="queryInput"
        v-model="query"
        type="search"
        placeholder="Find"
        aria-label="Find"
        spellcheck="false"
        @keydown="onQueryKey"
      />
      <span class="find-count" aria-live="polite">{{ count }}</span>
      <button class="icon" :aria-pressed="matchCase" title="Match case" aria-label="Match case" @click="matchCase = !matchCase">Aa</button>
      <button class="icon" :aria-pressed="wholeWord" title="Whole word" aria-label="Whole word" @click="wholeWord = !wholeWord">
        <u>ab</u>
      </button>
      <button class="icon" title="Previous (Shift+Enter)" aria-label="Previous match" @click="prev">↑</button>
      <button class="icon" title="Next (Enter)" aria-label="Next match" @click="next">↓</button>
      <button
        class="icon"
        :aria-pressed="showReplace"
        title="Replace (Ctrl/Cmd+H)"
        aria-label="Show replace"
        @click="showReplace = !showReplace"
      >
        ⇄
      </button>
      <button class="icon" title="Close (Esc)" aria-label="Close find" @click="close">✕</button>
    </div>
    <div v-if="showReplace" class="find-row">
      <input
        ref="replaceInput"
        v-model="replacement"
        placeholder="Replace with"
        aria-label="Replace with"
        spellcheck="false"
        @keydown="onReplaceKey"
      />
      <button title="Replace (Enter)" @click="replaceOne">Replace</button>
      <button title="Replace all (Ctrl/Cmd+Enter)" @click="replaceAll">All</button>
    </div>
  </div>
</template>
