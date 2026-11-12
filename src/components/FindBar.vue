<script>
// Remembered across openings of the find bar, like in most editors.
const last = { query: '', replacement: '', matchCase: false, wholeWord: false }
</script>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { findMatches, nextMatchIndex, prevMatchIndex, replaceAllEdit } from '../find'
import { applyEdit, scrollSelectionIntoView } from '../textedit'

// Find (and optionally replace) in the editor's textarea. The textarea can't
// highlight matches, so the current match is shown by selecting it.
const props = defineProps({
  target: { type: Object, default: null }, // the <textarea>
  text: { type: String, required: true },
})
// 'highlight' reports the current match as [start, end] (or null) so the
// editor can draw it: textareas don't show their selection while unfocused.
const emit = defineEmits(['close', 'edited', 'highlight'])
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

// Select match i in the textarea and scroll it into view, keeping focus in
// the find bar.
function select(i, keepFocus = document.activeElement) {
  const el = props.target
  current.value = i
  if (!el || i < 0) return
  const [s, e] = matches.value[i]
  el.focus({ preventScroll: true })
  el.setSelectionRange(s, e)
  scrollSelectionIntoView(el)
  keepFocus?.focus?.({ preventScroll: true })
  emit('highlight', [s, e])
}

function isSelected(i) {
  const el = props.target
  const m = matches.value[i]
  return el && m && el.selectionStart === m[0] && el.selectionEnd === m[1]
}

// Find as you type: jump to the first match after where the search started.
watch([query, matchCase, wholeWord], () => {
  message.value = ''
  if (query.value) select(nextMatchIndex(matches.value, anchor))
  else current.value = -1
})

// Keep the counter honest when the text changes under us.
watch(
  current,
  (i) => emit('highlight', i >= 0 && matches.value[i] ? [...matches.value[i]] : null),
  { flush: 'post' },
)

watch(matches, (list) => {
  if (current.value >= list.length || !isSelected(current.value)) {
    const el = props.target
    current.value = el ? list.findIndex(([s, e]) => s === el.selectionStart && e === el.selectionEnd) : -1
  }
})

function next() {
  message.value = ''
  const el = props.target
  const from = isSelected(current.value) ? matches.value[current.value][0] + 1 : el?.selectionStart ?? 0
  select(nextMatchIndex(matches.value, from))
}

function prev() {
  message.value = ''
  const el = props.target
  const from = isSelected(current.value) ? matches.value[current.value][0] : el?.selectionStart ?? 0
  select(prevMatchIndex(matches.value, from))
}

async function replaceOne() {
  const el = props.target
  if (!el || !matches.value.length) return
  if (!isSelected(current.value)) return next()
  const [s, e] = matches.value[current.value]
  const focus = document.activeElement
  applyEdit(el, { from: s, to: e, insert: replacement.value })
  emit('edited')
  await nextTick()
  select(nextMatchIndex(matches.value, s + replacement.value.length), focus)
}

async function replaceAll() {
  const el = props.target
  const edit = replaceAllEdit(props.text, matches.value, replacement.value)
  if (!el || !edit) return
  const focus = document.activeElement
  applyEdit(el, edit)
  emit('edited')
  await nextTick()
  focus?.focus?.()
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
  const el = props.target
  if (withReplace) showReplace.value = true
  if (el) {
    anchor = el.selectionStart
    const sel = el.value.slice(el.selectionStart, el.selectionEnd)
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
      <button class="icon" :aria-pressed="matchCase" title="Match case" @click="matchCase = !matchCase">Aa</button>
      <button class="icon" :aria-pressed="wholeWord" title="Whole word" @click="wholeWord = !wholeWord">
        <u>ab</u>
      </button>
      <button class="icon" title="Previous (Shift+Enter)" aria-label="Previous match" @click="prev">↑</button>
      <button class="icon" title="Next (Enter)" aria-label="Next match" @click="next">↓</button>
      <button
        class="icon"
        :aria-pressed="showReplace"
        title="Replace (Ctrl/Cmd+H)"
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
