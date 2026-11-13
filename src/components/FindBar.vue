<script>
// Remembered across openings of the find bar, like in most editors.
const last = { query: '', replacement: '', matchCase: false, wholeWord: false, regex: false }
</script>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { formatNumber } from '../locale'
import { t } from '../i18n'
import {
  MAX_MATCHES,
  escapeRegExp,
  expandReplacement,
  findMatches,
  nextMatchIndex,
  prevMatchIndex,
  queryError,
  replaceAllEdit,
} from '../find'

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
const regex = ref(last.regex)
watch([query, replacement, matchCase, wholeWord, regex], ([q, r, c, w, x]) =>
  Object.assign(last, { query: q, replacement: r, matchCase: c, wholeWord: w, regex: x }),
)
const options = computed(() => ({ matchCase: matchCase.value, wholeWord: wholeWord.value, regex: regex.value }))
const current = ref(-1)
const message = ref('')
const queryInput = ref(null)
const replaceInput = ref(null)
let anchor = 0 // where the search started, for find-as-you-type

const error = computed(() => queryError(query.value, options.value))
// The text searched. For big documents it follows typing once typing pauses
// (the highlights move with the edits meanwhile); anything that acts on a
// match calls refresh() first, so it never uses stale positions.
const BIG = 200_000
const searched = ref(props.text)
let refreshTimer
watch(
  () => props.text,
  (text) => {
    clearTimeout(refreshTimer)
    if (text.length < BIG) searched.value = text
    else refreshTimer = setTimeout(() => (searched.value = text), 250)
  },
)
function refresh() {
  clearTimeout(refreshTimer)
  searched.value = props.editor?.getText() ?? props.text
}
onBeforeUnmount(() => clearTimeout(refreshTimer))

const matches = computed(() => findMatches(searched.value, query.value, options.value, MAX_MATCHES))
// How many matches, formatted ("1,234", or "100,000+" at the limit).
const total = computed(() => {
  const n = formatNumber(matches.value.length)
  return matches.value.length >= MAX_MATCHES ? t('find.atLeast', { n }) : n
})

const count = computed(() => {
  if (message.value) return message.value
  if (!query.value) return ''
  if (error.value) return error.value
  if (!matches.value.length) return t('find.noResults')
  return current.value >= 0 ? t('find.position', { current: current.value + 1, total: total.value }) : t('find.found', { total: total.value })
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
watch([matches, () => props.editor], ([list, ed]) => ed?.highlight(list), { immediate: true })
onBeforeUnmount(() => props.editor?.highlight([]))

// Find as you type: jump to the first match after where the search started.
watch([query, matchCase, wholeWord, regex], () => {
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
  refresh()
  message.value = ''
  const from = isSelected(current.value) ? matches.value[current.value][0] + 1 : selection().from
  select(nextMatchIndex(matches.value, from))
}

function prev() {
  refresh()
  message.value = ''
  const from = isSelected(current.value) ? matches.value[current.value][0] : selection().from
  select(prevMatchIndex(matches.value, from))
}

// The text prop only catches up on the next render, so edits read the
// editor's own text.
const liveMatches = (limit) => findMatches(props.editor.getText(), query.value, options.value, limit)

async function replaceOne() {
  refresh()
  if (!props.editor || !matches.value.length) return
  if (!isSelected(current.value)) return next()
  const text = props.editor.getText()
  // The selected match, freshly matched so its groups are current.
  const [s, e] = matches.value[current.value]
  const m = liveMatches().find((x) => x[0] === s && x[1] === e) ?? [s, e]
  const insert = expandReplacement(replacement.value, m, text, regex.value)
  props.editor.replace(s, e, insert)
  refresh()
  await nextTick()
  // Continue after the replacement (and past an empty match, so "^" moves on).
  select(nextMatchIndex(matches.value, s + insert.length + (s === e ? 1 : 0)))
}

async function replaceAll() {
  if (!props.editor) return
  const text = props.editor.getText()
  const edit = replaceAllEdit(text, liveMatches(), replacement.value, regex.value)
  if (!edit) return
  props.editor.replace(edit.from, edit.to, edit.insert)
  await nextTick()
  current.value = -1
  message.value = t('find.replaced', { count: edit.count })
}

// Alt+C, Alt+W, Alt+R toggle match case, whole word and regex (by key
// position, since Alt types other characters on a Mac).
function onOptionKey(e) {
  if (!e.altKey || e.ctrlKey || e.metaKey) return
  const toggle = { KeyC: matchCase, KeyW: wholeWord, KeyR: regex }[e.code]
  if (!toggle) return
  e.preventDefault()
  toggle.value = !toggle.value
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
    // In regex mode, the selected text is searched for literally.
    if (sel && !sel.includes('\n')) query.value = regex.value ? escapeRegExp(sel) : sel
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
  <div class="findbar" role="search" @keydown.esc.prevent="close" @keydown="onOptionKey">
    <div class="find-row">
      <input
        ref="queryInput"
        v-model="query"
        type="search"
        :placeholder="t(regex ? 'find.placeholderRegex' : 'find.placeholder')"
        :aria-label="t('find.placeholder')"
        spellcheck="false"
        autocomplete="off"
        :class="{ invalid: !!error }"
        :aria-invalid="!!error"
        @keydown="onQueryKey"
      />
      <span class="find-count" :class="{ error: !!error }" aria-live="polite">{{ count }}</span>
      <button class="icon" :aria-pressed="matchCase" :title="t('find.matchCaseTitle')" :aria-label="t('find.matchCase')" @click="matchCase = !matchCase">Aa</button>
      <button class="icon" :aria-pressed="wholeWord" :title="t('find.wholeWordTitle')" :aria-label="t('find.wholeWord')" @click="wholeWord = !wholeWord">
        <u>ab</u>
      </button>
      <button
        class="icon mono"
        :aria-pressed="regex"
        :title="t('find.regexTitle')"
        :aria-label="t('find.regex')"
        @click="regex = !regex"
      >
        .*
      </button>
      <button class="icon" :title="t('find.previousTitle')" :aria-label="t('find.previous')" @click="prev">↑</button>
      <button class="icon" :title="t('find.nextTitle')" :aria-label="t('find.next')" @click="next">↓</button>
      <button
        class="icon"
        :aria-pressed="showReplace"
        :title="t('find.showReplaceTitle')"
        :aria-label="t('find.showReplace')"
        @click="showReplace = !showReplace"
      >
        ⇄
      </button>
      <button class="icon" :title="t('common.closeEsc')" :aria-label="t('find.close')" @click="close">✕</button>
    </div>
    <div v-if="showReplace" class="find-row">
      <input
        ref="replaceInput"
        v-model="replacement"
        :placeholder="t(regex ? 'find.replaceWithRegex' : 'find.replaceWith')"
        :title="regex ? t('find.replaceRegexHelp') : ''"
        :aria-label="t('find.replaceWith')"
        spellcheck="false"
        @keydown="onReplaceKey"
      />
      <button :title="t('find.replaceTitle')" @click="replaceOne">{{ t('find.replace') }}</button>
      <button :title="t('find.replaceAllTitle')" @click="replaceAll">{{ t('find.replaceAll') }}</button>
    </div>
  </div>
</template>
