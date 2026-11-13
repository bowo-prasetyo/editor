<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  createDoc,
  listVersions,
  moveToFolder,
  recordVersion,
  restoreVersion,
  state,
  versionText,
} from '../store'
import { KINDS } from '../history'
import { EditorView, lineNumbers } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { theme } from '../cm'
import { displayName } from '../naming'
import { showToast } from '../toast'
import { formatDate, formatDateTime, formatNumber, formatRelative } from '../locale'

// Earlier versions of a document: what changed since each one, and bringing
// one back. The diff view (CodeMirror's merge package) loads on first use.
const props = defineProps({
  doc: { type: Object, required: true },
})
const emit = defineEmits(['close'])
const router = useRouter()

const versions = ref([]) // newest first
const selected = ref(null) // version metadata
const selectedText = ref(null)
const stats = ref(null) // { added, removed } lines, or null while working
const host = ref(null)
let view = null
let refreshTimer

async function refresh() {
  versions.value = (await listVersions(props.doc.id)).reverse()
  if (selected.value && !versions.value.some((v) => v.id === selected.value.id)) select(null)
}

// --- Labels ---------------------------------------------------------------------

const ago = (t) => formatRelative(t)
const when = (t) => formatDateTime(t)
const describe = (v) => v.label || KINDS[v.kind] || v.kind
const chars = (n) => `${formatNumber(n)} chars`

// --- The diff -------------------------------------------------------------------

async function select(v) {
  selected.value = v
  selectedText.value = null
  stats.value = null
  view?.destroy()
  view = null
  if (!v) return
  const text = await versionText(v.id)
  if (selected.value !== v) return
  selectedText.value = text ?? ''
  await nextTick()
  await showDiff()
}

let diffTimer
async function showDiff() {
  if (!host.value || selectedText.value == null) return
  const { unifiedMergeView, getChunks } = await import('@codemirror/merge')
  if (!host.value || selectedText.value == null) return
  view?.destroy()
  // The current text, showing what changed since the selected version:
  // removed lines in red, added text in green; unchanged runs are collapsed.
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.doc.content,
      extensions: [
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.lineWrapping,
        lineNumbers(),
        theme,
        unifiedMergeView({
          original: selectedText.value,
          mergeControls: false,
          gutter: true,
          collapseUnchanged: { margin: 3, minSize: 6 },
          diffConfig: { timeout: 500 },
        }),
      ],
    }),
  })
  // Count changed lines from the diff's chunks.
  const chunks = getChunks(view.state)?.chunks ?? []
  const lineCount = (doc, from, to) => (to > from ? doc.lineAt(Math.max(from, to - 1)).number - doc.lineAt(from).number + 1 : 0)
  const original = EditorState.create({ doc: selectedText.value }).doc
  let added = 0
  let removed = 0
  for (const c of chunks) {
    added += lineCount(view.state.doc, c.fromB, c.toB)
    removed += lineCount(original, c.fromA, c.toA)
  }
  stats.value = { added, removed, same: !chunks.length }
}

// Follow edits made while the panel is open (after a pause).
watch(
  () => props.doc.content,
  () => {
    clearTimeout(diffTimer)
    diffTimer = setTimeout(showDiff, 600)
  },
)
watch(() => props.doc.id, () => select(null).then(refresh))

// --- Actions --------------------------------------------------------------------

async function restore() {
  const v = selected.value
  if (!v) return
  const text = await restoreVersion(props.doc.id, v.id)
  if (text == null) return showToast("Couldn't read that version.")
  showToast(`Restored the version from ${when(v.at)}. The text it replaced was kept as a version.`, { timeout: 6000 })
  await refresh()
  select(null)
}

async function saveVersion() {
  const label = prompt('Name this version (optional):', '')
  if (label === null) return
  await recordVersion(props.doc.id, 'manual', label.trim())
  await refresh()
  showToast('Version saved.')
}

function openCopy() {
  const v = selected.value
  if (!v || selectedText.value == null) return
  const base = displayName(props.doc.name).replace(/(\.[^.]+)?$/, (ext) => ` (${formatDate(v.at)})${ext}`)
  const copy = createDoc(base, selectedText.value, { autoName: false })
  if (props.doc.folder) moveToFolder(copy.id, props.doc.folder)
  router.push({ name: 'edit', params: { id: copy.id } })
}

const memoryOnly = computed(() => state.backend === 'localStorage')

onMounted(() => {
  refresh()
  refreshTimer = setInterval(refresh, 30_000) // automatic versions appear as you work
})
onBeforeUnmount(() => {
  clearInterval(refreshTimer)
  clearTimeout(diffTimer)
  view?.destroy()
})
</script>

<template>
  <aside class="history" aria-label="Version history">
    <header class="history-head">
      <strong>History</strong>
      <span class="spacer" />
      <button title="Keep the current text as a version, with a name if you like" @click="saveVersion">Save version…</button>
      <button class="icon" aria-label="Close history" title="Close" @click="emit('close')">✕</button>
    </header>

    <p v-if="memoryOnly" class="hint history-note">
      This browser can't use IndexedDB, so versions are kept only until this page is closed.
    </p>

    <ol class="history-list">
      <li v-if="!versions.length" class="hint">
        No versions yet. One is kept when you open a file, every few minutes while you edit, and when you save to a file
        or press Save version.
      </li>
      <li v-for="v in versions" :key="v.id">
        <button class="history-item" :aria-pressed="selected?.id === v.id" @click="select(selected?.id === v.id ? null : v)">
          <span class="history-when" :title="when(v.at)">{{ ago(v.at) }}</span>
          <span class="history-what" :class="{ named: v.label || v.kind !== 'auto' }">{{ describe(v) }}</span>
          <span class="history-size">{{ chars(v.size) }}</span>
        </button>
      </li>
    </ol>

    <section v-if="selected" class="history-diff">
      <div class="history-diff-head">
        <span>
          Changes since {{ when(selected.at) }}:
          <template v-if="!stats">comparing…</template>
          <template v-else-if="stats.same">none</template>
          <template v-else>
            <span class="added">+{{ stats.added }}</span> <span class="removed">−{{ stats.removed }}</span> lines
          </template>
        </span>
        <span class="spacer" />
        <button @click="openCopy">Open as copy</button>
        <button class="primary" :disabled="stats?.same" @click="restore">Restore</button>
      </div>
      <div ref="host" class="history-view" />
    </section>
  </aside>
</template>
