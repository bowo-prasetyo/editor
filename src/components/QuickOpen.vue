<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { createDoc, requestPersistence, state } from '../store'
import { displayName } from '../naming'
import { prefs } from '../prefs'
import { fuzzyMatch, highlightRuns } from '../fuzzy'
import { normalizeFolder } from '../folders'
import { availableCommands, groupName, ui } from '../commands'
import { isMac, keyLabel, shortcut } from '../keys'
import { BinaryFileError } from '../store'
import { showToast } from '../toast'
import { ensureAllIndexes, fileIndex, openWorkspaceFile } from '../workspace'
import { useModal } from '../modal'
import { t } from '../i18n'

// Ctrl/Cmd+P: jump to any document by typing part of its name or folder.
// With nothing typed, recently opened documents come first.
// Starting with ">" (or Ctrl/Cmd+Shift+P) lists commands instead.
const router = useRouter()
const open = ref(false)
const query = ref('')
const active = ref(0)
const input = ref(null)
const list = ref(null)
let returnFocus = null
const MAX_RECENT_COMMANDS = 5
// Focus stays in the dialog and Escape closes it (see modal.js); hide()
// puts focus back itself.
const root = ref(null)
useModal(root, { onEscape: () => hide(), restoreFocus: false })

const MAX_SHOWN = 50
const commandMode = computed(() => query.value.startsWith('>'))
// "#": the open Markdown document's headings (see mdedit.js), to jump to.
const headingMode = computed(() => query.value.startsWith('#'))
const headingResults = computed(() => {
  if (!headingMode.value) return []
  const q = query.value.slice(1).trim()
  const list = ui.headings?.() ?? []
  if (!q) return list.map((h) => ({ heading: h, positions: [] }))
  return list
    .map((h) => ({ heading: h, m: fuzzyMatch(q, h.text) }))
    .filter((r) => r.m)
    .sort((a, b) => b.m.score - a.m.score)
    .map((r) => ({ heading: r.heading, positions: r.m.positions }))
})

const commandResults = computed(() => {
  if (!commandMode.value) return []
  const q = query.value.slice(1).trim()
  const list = availableCommands()
  if (!q) {
    // The commands run lately first, then the rest in their usual order.
    const recent = (prefs.recentCommands ?? []).map((id) => list.find((c) => c.id === id)).filter(Boolean)
    const rest = list.filter((c) => !recent.includes(c))
    return [...recent.map((c) => ({ command: c, positions: [], recent: true })), ...rest.map((c) => ({ command: c, positions: [] }))]
  }
  return list
    .map((c) => ({ command: c, m: fuzzyMatch(q, c.title) }))
    .filter((r) => r.m)
    .sort((a, b) => b.m.score - a.m.score)
    .map((r) => ({ command: r.command, positions: r.m.positions }))
})
const keysFor = (c) => shortcut(c.shortcut).map((k) => keyLabel(k)).join(' / ')

const docs = computed(() => state.docs.filter((d) => !d.deletedAt))

// Files in open folders that have no document yet, as { rootId, path,
// handle, name, folder } (folder: the folder's name and path, as documents
// opened from it are filed).
const openedFiles = computed(() => new Set(docs.value.filter((d) => d.source).map((d) => `${d.source.root}:${d.source.path}`)))
const folderFiles = computed(() => {
  const out = []
  for (const w of prefs.workspaces) {
    const index = fileIndex.get(w.id)
    if (!index) continue
    for (const { path, handle } of index.files) {
      if (openedFiles.value.has(`${w.id}:${path}`)) continue
      const slash = path.lastIndexOf('/')
      out.push({ rootId: w.id, path, handle, name: path.slice(slash + 1), folder: w.name + (slash === -1 ? '' : '/' + path.slice(0, slash)) })
    }
  }
  return out
})
const indexing = computed(() => prefs.workspaces.some((w) => fileIndex.get(w.id) && !fileIndex.get(w.id).ready))

// Results: { key, name, folder, positions, folderPositions, doc? | file? }
function scored(q, name, folderPath) {
  const folder = folderPath ? folderPath + '/' : ''
  const m = fuzzyMatch(q, folder + name, folder.length)
  if (!m) return null
  return {
    score: m.score,
    positions: m.positions.filter((p) => p >= folder.length).map((p) => p - folder.length),
    folderPositions: m.positions.filter((p) => p < folder.length),
  }
}

const results = computed(() => {
  if (headingMode.value) return []
  if (commandMode.value) return []
  const q = query.value.trim()
  if (!q) {
    const rank = new Map(prefs.recent.map((id, i) => [id, i]))
    return [...docs.value]
      .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || b.updatedAt - a.updatedAt)
      .slice(0, MAX_SHOWN)
      .map((doc) => ({ key: doc.id, doc, name: displayName(doc.name), folder: doc.folder ?? '', positions: [], folderPositions: [] }))
  }
  const out = []
  for (const doc of docs.value) {
    const name = displayName(doc.name)
    const m = scored(q, name, doc.folder)
    if (m) out.push({ key: doc.id, doc, name, folder: doc.folder ?? '', updated: doc.updatedAt, ...m })
  }
  for (const file of folderFiles.value) {
    const m = scored(q, file.name, file.folder)
    if (m) out.push({ key: `${file.rootId}:${file.path}`, file, name: file.name, folder: file.folder, updated: 0, ...m })
  }
  return out.sort((a, b) => b.score - a.score || b.updated - a.updated).slice(0, MAX_SHOWN)
})

// "Work/todo.md" creates todo.md in the Work folder.
const createLabel = computed(() => {
  const q = query.value.trim()
  if (commandMode.value || headingMode.value) return ''
  if (!q || results.value.some((r) => r.name.toLowerCase() === q.toLowerCase())) return ''
  return q
})
const count = computed(() =>
  commandMode.value
    ? commandResults.value.length
    : headingMode.value
      ? headingResults.value.length
      : results.value.length + (createLabel.value ? 1 : 0),
)

watch(query, () => (active.value = 0))
watch(active, async (i) => {
  await nextTick()
  list.value?.querySelector(`[data-index="${i}"]`)?.scrollIntoView({ block: 'nearest' })
})

async function show(prefix = '') {
  returnFocus = document.activeElement
  query.value = prefix
  active.value = 0
  open.value = true
  // List the files in open folders (once; kept until a folder is refreshed).
  ensureAllIndexes()
  await nextTick()
  input.value?.focus()
}

function hide(refocus = true) {
  open.value = false
  // Once the dialog has gone (while it's open, it keeps focus: modal.js).
  if (refocus) nextTick(() => returnFocus?.focus?.())
}

function choose(i) {
  if (headingMode.value) {
    const h = headingResults.value[i]?.heading
    if (!h) return
    hide(false)
    nextTick(() => ui.goTo?.(h.from))
    return
  }
  if (commandMode.value) {
    const c = commandResults.value[i]?.command
    if (!c) return
    prefs.recentCommands = [c.id, ...(prefs.recentCommands ?? []).filter((id) => id !== c.id)].slice(0, MAX_RECENT_COMMANDS)
    hide()
    // After the dialog is gone, so the command can move focus itself.
    nextTick(() => c.run())
    return
  }
  if (i < results.value.length) {
    const r = results.value[i]
    hide(false)
    if (r.doc) return router.push({ name: 'edit', params: { id: r.doc.id } })
    openWorkspaceFile(r.file.rootId, r.file.path, r.file.handle)
      .then(({ doc }) => router.push({ name: 'edit', params: { id: doc.id } }))
      .catch((e) =>
        showToast(e instanceof BinaryFileError ? t('open.notTextOne', { name: r.name }) : t('open.failed', { name: r.name, error: e.message })),
      )
  } else if (createLabel.value) {
    // A new draft, named after what was typed ("Work/todo.md" -> "todo.md":
    // drafts have no folders; see docs/files-and-drafts.md).
    const path = normalizeFolder(createLabel.value)
    let name = path.slice(path.lastIndexOf('/') + 1)
    if (!/\.[^.]+$/.test(name)) name += '.md'
    const doc = createDoc(name, '', { autoName: false })
    requestPersistence()
    hide(false)
    router.push({ name: 'edit', params: { id: doc.id } })
  }
}

function onKey(e) {
  if (e.key === 'ArrowDown') active.value = (active.value + 1) % Math.max(1, count.value)
  else if (e.key === 'ArrowUp') active.value = (active.value - 1 + count.value) % Math.max(1, count.value)
  else if (e.key === 'Enter') choose(active.value)
  else return
  e.preventDefault()
}

// Ctrl+P (Cmd+P on a Mac) for documents, with Shift for commands, anywhere.
// Printing stays in the editor's toolbar.
function onWindowKey(e) {
  const mod = isMac ? e.metaKey : e.ctrlKey
  if (mod && !e.altKey && e.key.toLowerCase() === 'p') {
    e.preventDefault()
    e.stopPropagation()
    const prefix = e.shiftKey ? '>' : ''
    if (open.value && commandMode.value === e.shiftKey) hide()
    else if (open.value) query.value = prefix
    else show(prefix)
  }
}
onMounted(() => window.addEventListener('keydown', onWindowKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKey, true))

defineExpose({ show })
const folderRuns = (r) => highlightRuns(r.folder, r.folderPositions)
const id = (i) => `quick-open-${i}`
</script>

<template>
  <div v-if="open" class="quick-backdrop" @mousedown.self="hide()">
    <div ref="root" class="quick" role="dialog" aria-modal="true" :aria-label="t(commandMode ? 'quickOpen.commandsLabel' : headingMode ? 'quickOpen.headingsLabel' : 'quickOpen.documentsLabel')">
      <input
        ref="input"
        v-model="query"
        class="quick-input"
        :placeholder="t(commandMode ? 'quickOpen.commandsPlaceholder' : headingMode ? 'quickOpen.headingsPlaceholder' : prefs.workspaces.length ? 'quickOpen.filesPlaceholder' : 'quickOpen.documentsPlaceholder')"
        role="combobox"
        aria-expanded="true"
        aria-controls="quick-open-list"
        :aria-activedescendant="count ? id(active) : undefined"
        autocomplete="off"
        spellcheck="false"
        @keydown="onKey"
      />
      <ul id="quick-open-list" ref="list" class="quick-list" role="listbox">
        <template v-if="headingMode">
          <li
            v-for="(r, i) in headingResults"
            :id="id(i)"
            :key="r.heading.from"
            :data-index="i"
            role="option"
            :aria-selected="i === active"
            :class="{ active: i === active }"
            :style="{ paddingLeft: 12 + (r.heading.level - 1) * 14 + 'px' }"
            @mousemove="active = i"
            @click="choose(i)"
          >
            <span class="quick-name">
              <template v-for="(run, k) in highlightRuns(r.heading.text, r.positions)" :key="k">
                <mark v-if="run.hit">{{ run.text }}</mark><template v-else>{{ run.text }}</template>
              </template>
            </span>
            <span class="quick-folder">{{ t('quickOpen.headingLevel', { level: String(r.heading.level) }) }}</span>
          </li>
          <li v-if="!headingResults.length" class="quick-empty">
            {{ t(ui.headings ? 'quickOpen.noHeadings' : 'quickOpen.headingsNeedMarkdown') }}
          </li>
        </template>
        <template v-else-if="commandMode">
          <li
            v-for="(r, i) in commandResults"
            :id="id(i)"
            :key="r.command.id"
            :data-index="i"
            role="option"
            :aria-selected="i === active"
            :class="{ active: i === active }"
            @mousemove="active = i"
            @click="choose(i)"
          >
            <span class="quick-name">
              <template v-for="(run, k) in highlightRuns(r.command.title, r.positions)" :key="k">
                <mark v-if="run.hit">{{ run.text }}</mark><template v-else>{{ run.text }}</template>
              </template>
            </span>
            <span class="quick-folder">{{ r.recent ? t('quickOpen.recentlyUsed') : groupName(r.command.group) }}</span>
            <kbd v-if="keysFor(r.command)" class="quick-keys">{{ keysFor(r.command) }}</kbd>
          </li>
          <li v-if="!commandResults.length" class="quick-empty">{{ t('quickOpen.noCommands') }}</li>
        </template>
        <template v-else>
        <li
          v-for="(r, i) in results"
          :id="id(i)"
          :key="r.key"
          :data-index="i"
          role="option"
          :aria-selected="i === active"
          :class="{ active: i === active, 'on-disk': !!r.file }"
          :title="r.file ? t('quickOpen.notOpenedYet') : undefined"
          @mousemove="active = i"
          @click="choose(i)"
        >
          <span class="quick-name">
            <template v-for="(run, k) in highlightRuns(r.name, r.positions)" :key="k">
              <mark v-if="run.hit">{{ run.text }}</mark><template v-else>{{ run.text }}</template>
            </template>
          </span>
          <span v-if="r.folder" class="quick-folder">
            <template v-for="(run, k) in folderRuns(r)" :key="k">
              <mark v-if="run.hit">{{ run.text }}</mark><template v-else>{{ run.text }}</template>
            </template>
          </span>
        </li>
        <li
          v-if="createLabel"
          :id="id(results.length)"
          :data-index="results.length"
          role="option"
          :aria-selected="active === results.length"
          :class="{ active: active === results.length }"
          class="quick-create"
          @mousemove="active = results.length"
          @click="choose(results.length)"
        >
          {{ t('quickOpen.create', { name: createLabel }) }}
        </li>
        <li v-if="!count" class="quick-empty">{{ t(indexing ? 'quickOpen.listing' : 'quickOpen.noDocuments') }}</li>
        <li v-else-if="indexing && query.trim()" class="quick-empty">{{ t('quickOpen.stillListing') }}</li>
        </template>
      </ul>
    </div>
  </div>
</template>
