<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, triggerRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { queryError } from '../find'
import { SCOPES, replaceAll, replaceInTarget, search, searchAll, warmCache } from '../search'
import { openWorkspaceFile } from '../workspace'
import { BinaryFileError } from '../store'
import { prefs } from '../prefs'
import { showToast } from '../toast'
import { unsavedToDisk } from '../fileaccess'
import { saveAll } from '../saveall'

// Search every document and the files in open folders; replace across them.
const route = useRoute()
const router = useRouter()
const queryInput = ref(null)

const options = computed(() => ({ matchCase: search.matchCase, wholeWord: search.wholeWord, regex: search.regex }))
const error = computed(() => (search.query ? queryError(search.query, options.value) : ''))

// Results: [{ target, matches, collapsed }], filled in as files are searched.
const results = shallowRef([])
const byPath = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const summary = ref(null) // what searchAll() resolved to
const progress = ref(null) // { done, total } while searching
let controller = null
let timer = null

async function run() {
  controller?.abort()
  clearTimeout(timer)
  results.value = []
  summary.value = null
  progress.value = null
  if (!search.query || error.value) return
  const mine = (controller = new AbortController())
  progress.value = { done: 0, total: 0 }
  try {
    const s = await searchAll(search.query, options.value, {
      scope: search.scope,
      files: search.files,
      signal: mine.signal,
      // Kept in path order as they arrive (documents and files on disk mixed).
      onResult: (r) => {
        const list = results.value
        const at = list.findIndex((x) => byPath.compare(x.target.path, r.target.path) > 0)
        list.splice(at === -1 ? list.length : at, 0, { ...r, collapsed: false })
        triggerRef(results)
      },
      onProgress: (done, total) => mine === controller && (progress.value = { done, total }),
    })
    if (mine !== controller || s.aborted) return
    summary.value = s
  } catch (e) {
    if (mine === controller) showToast(`Search failed: ${e.message}`)
  } finally {
    if (mine === controller) progress.value = null
  }
}

// Search as you type, once typing pauses.
watch(
  () => [search.query, search.files, search.scope, search.matchCase, search.wholeWord, search.regex],
  () => {
    clearTimeout(timer)
    timer = setTimeout(run, 250)
  },
)

const totalMatches = computed(() => results.value.reduce((n, r) => n + r.matches.length, 0))
const status = computed(() => {
  if (!search.query) return ''
  if (error.value) return error.value
  if (progress.value) {
    const { done, total } = progress.value
    return total ? `Searching… ${done.toLocaleString()} of ${total.toLocaleString()} files` : 'Searching…'
  }
  if (!summary.value) return ''
  const n = totalMatches.value
  if (!n) return 'No results'
  const files = results.value.length
  return `${n.toLocaleString()} result${n === 1 ? '' : 's'} in ${files.toLocaleString()} file${files === 1 ? '' : 's'}`
})
const notes = computed(() => {
  const s = summary.value
  if (!s) return []
  const out = []
  if (s.truncated) out.push('Showing the first 10,000 results: narrow the search to see the rest.')
  if (s.skipped) out.push(`${s.skipped} file${s.skipped === 1 ? ' was' : 's were'} skipped: not text, or over 2 MB.`)
  return out
})
const hasFolders = computed(() => prefs.workspaces.length > 0)

// --- Opening a result --------------------------------------------------------------------

async function idFor(target) {
  if (target.kind === 'doc') return target.doc.id
  const { doc } = await openWorkspaceFile(target.rootId, target.filePath, target.handle)
  return doc.id
}

async function openMatch(r, m) {
  try {
    const id = await idFor(r.target)
    router.push({ name: 'edit', params: { id }, query: { at: `${m.from}-${m.to}` } })
  } catch (e) {
    showToast(e instanceof BinaryFileError ? `Couldn't open “${r.target.name}”.` : `Couldn't open “${r.target.name}”: ${e.message}`)
  }
}

function dismiss(r) {
  results.value = results.value.filter((x) => x !== r)
}
function toggle(r) {
  r.collapsed = !r.collapsed
  triggerRef(results)
}
const allCollapsed = computed(() => results.value.length > 0 && results.value.every((r) => r.collapsed))
function collapseAll() {
  const to = !allCollapsed.value
  for (const r of results.value) r.collapsed = to
  triggerRef(results)
}

// --- Replacing -----------------------------------------------------------------------------

const replacing = ref(false)
const toSave = computed(() => unsavedToDisk().length)

function afterReplace({ files, count }) {
  if (!count) return showToast('Nothing to replace: the text changed since the search.')
  const what = `Replaced ${count.toLocaleString()} match${count === 1 ? '' : 'es'} in ${files} file${files === 1 ? '' : 's'}.`
  const save = toSave.value
  showToast(
    save ? `${what} Undo from each file's History. Changes aren't saved to the files on disk yet.` : `${what} Undo from each document's History.`,
    { timeout: 10000, ...(save ? { action: { label: 'Save all', run: saveAll } } : {}) },
  )
}

async function onReplaceAll() {
  if (!results.value.length || replacing.value) return
  const n = totalMatches.value
  const files = results.value.length
  const shown = search.replace ? `“${search.replace}”` : 'nothing (delete them)'
  if (!confirm(`Replace ${n.toLocaleString()} match${n === 1 ? '' : 'es'} in ${files} file${files === 1 ? '' : 's'} with ${shown}?`)) return
  replacing.value = true
  try {
    afterReplace(await replaceAll(results.value.map((r) => r.target), search.query, options.value, search.replace))
  } catch (e) {
    showToast(`Couldn't replace everywhere: ${e.message}`)
  } finally {
    replacing.value = false
    run()
  }
}

async function onReplaceIn(r) {
  if (replacing.value) return
  replacing.value = true
  try {
    const { doc, count } = await replaceInTarget(r.target, search.query, options.value, search.replace)
    afterReplace({ files: count ? 1 : 0, count, docs: [doc] })
  } catch (e) {
    showToast(`Couldn't replace in “${r.target.name}”: ${e.message}`)
  } finally {
    replacing.value = false
    run()
  }
}

// --- Keyboard and setup ----------------------------------------------------------------------

function onOptionKey(e) {
  if (!e.altKey || e.ctrlKey || e.metaKey) return
  const key = { KeyC: 'matchCase', KeyW: 'wholeWord', KeyR: 'regex' }[e.code]
  if (!key) return
  e.preventDefault()
  search[key] = !search[key]
}
function onQueryKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    run()
  }
}

// Opened with text to look for (the editor's selection).
async function focusQuery() {
  if (typeof route.query.q === 'string' && route.query.q) {
    search.query = route.query.q
    router.replace({ name: 'search' })
  }
  await nextTick()
  queryInput.value?.focus()
  queryInput.value?.select()
}
watch(() => route.query.q, (q) => q && focusQuery())
onMounted(() => {
  focusQuery()
  run()
  // Read the folders' files into memory meanwhile, so searches are quick.
  warmCache().catch(() => {})
})
onBeforeUnmount(() => {
  controller?.abort()
  clearTimeout(timer)
})

const lineLabel = (m) => `${m.line}`
</script>

<template>
  <section class="search-page" @keydown="onOptionKey">
    <h1 class="search-title">Search</h1>
    <div class="findbar search-form" role="search">
      <div class="find-row">
        <button
          class="icon"
          :aria-pressed="search.showReplace"
          :aria-label="search.showReplace ? 'Hide replace' : 'Show replace'"
          title="Replace"
          @click="search.showReplace = !search.showReplace"
        >
          {{ search.showReplace ? '▾' : '▸' }}
        </button>
        <input
          ref="queryInput"
          v-model="search.query"
          type="search"
          :placeholder="search.regex ? 'Search (regular expression)' : 'Search in all documents and folders'"
          aria-label="Search"
          spellcheck="false"
          autocomplete="off"
          :class="{ invalid: !!error }"
          :aria-invalid="!!error"
          @keydown="onQueryKey"
        />
        <button class="icon" :aria-pressed="search.matchCase" title="Match case (Alt+C)" aria-label="Match case" @click="search.matchCase = !search.matchCase">Aa</button>
        <button class="icon" :aria-pressed="search.wholeWord" title="Whole word (Alt+W)" aria-label="Whole word" @click="search.wholeWord = !search.wholeWord"><u>ab</u></button>
        <button class="icon mono" :aria-pressed="search.regex" title="Regular expression (Alt+R)" aria-label="Regular expression" @click="search.regex = !search.regex">.*</button>
      </div>
      <div v-if="search.showReplace" class="find-row">
        <span class="icon-spacer" />
        <input
          v-model="search.replace"
          :placeholder="search.regex ? 'Replace with ($1, $<name>, \\n…)' : 'Replace with'"
          aria-label="Replace with"
          spellcheck="false"
        />
        <button :disabled="!results.length || replacing" title="Replace every result shown below" @click="onReplaceAll">Replace all</button>
      </div>
      <div class="find-row">
        <span class="icon-spacer" />
        <input
          v-model="search.files"
          class="files-filter"
          placeholder="Files to include, e.g. *.js, src/  (! to exclude: !*.min.js)"
          aria-label="Files to include or exclude"
          spellcheck="false"
          autocomplete="off"
        />
        <select v-if="hasFolders" v-model="search.scope" aria-label="Where to search" class="scope">
          <option v-for="(label, key) in SCOPES" :key="key" :value="key">{{ label }}</option>
        </select>
      </div>
    </div>

    <div class="search-status">
      <span :class="{ error: !!error }" aria-live="polite">{{ status }}</span>
      <span class="spacer" />
      <button v-if="toSave" class="primary" title="Write every changed file back to disk" @click="saveAll">
        Save all ({{ toSave }})
      </button>
      <button v-if="results.length" class="link" @click="collapseAll">{{ allCollapsed ? 'Expand all' : 'Collapse all' }}</button>
    </div>
    <p v-for="n in notes" :key="n" class="hint search-note">{{ n }}</p>
    <p v-if="!search.query" class="empty search-empty">
      Type to search every document<template v-if="hasFolders"> and every file in your open folders</template>.
      Click a result to open it there.
    </p>

    <ul class="search-results">
      <li v-for="r in results" :key="r.target.key" class="search-file">
        <div class="search-file-head">
          <button class="link search-toggle" :aria-expanded="!r.collapsed" @click="toggle(r)">
            {{ r.collapsed ? '▸' : '▾' }} <strong>{{ r.target.name }}</strong>
            <span class="search-folder">{{ r.target.folder }}</span>
          </button>
          <span class="search-count">{{ r.matches.length }}</span>
          <button v-if="search.showReplace" class="mini" :disabled="replacing" :title="`Replace in ${r.target.name}`" @click="onReplaceIn(r)">Replace</button>
          <button class="mini" :title="`Hide ${r.target.name} from the results`" :aria-label="`Hide ${r.target.name} from the results`" @click="dismiss(r)">×</button>
        </div>
        <ul v-if="!r.collapsed" class="search-lines">
          <li v-for="m in r.matches" :key="m.from">
            <button class="search-line" :title="`Line ${m.line}, column ${m.col}`" @click="openMatch(r, m)">
              <span class="search-ln">{{ lineLabel(m) }}</span>
              <span class="search-preview">{{ m.before }}<mark :class="{ replaced: search.showReplace }">{{ m.text }}</mark><ins v-if="search.showReplace && !search.regex">{{ search.replace }}</ins>{{ m.after }}</span>
            </button>
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>
