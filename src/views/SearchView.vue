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
import { compareNatural, formatNumber } from '../locale'
import { t } from '../i18n'

// Search every document and the files in open folders; replace across them.
const route = useRoute()
const router = useRouter()
const queryInput = ref(null)

const options = computed(() => ({ matchCase: search.matchCase, wholeWord: search.wholeWord, regex: search.regex }))
const error = computed(() => (search.query ? queryError(search.query, options.value) : ''))

// Results: [{ target, matches, collapsed }], filled in as files are searched.
const results = shallowRef([])
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
        const at = list.findIndex((x) => compareNatural(x.target.path, r.target.path) > 0)
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
    return total ? t('search.progress', { done, count: total }) : t('search.searching')
  }
  if (!summary.value) return ''
  const n = totalMatches.value
  if (!n) return t('find.noResults')
  return t('search.results', { count: n, files: t('search.files', { count: results.value.length }) })
})
const notes = computed(() => {
  const s = summary.value
  if (!s) return []
  const out = []
  if (s.truncated) out.push(t('search.truncated', { max: 10_000 }))
  if (s.skipped) out.push(t('search.skipped', { count: s.skipped }))
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
    showToast(e instanceof BinaryFileError ? t('open.notTextOne', { name: r.target.name }) : t('open.failed', { name: r.target.name, error: e.message }))
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
  if (!count) return showToast(t('search.nothingToReplace'))
  const what = t('search.replaced', { count, files: t('search.files', { count: files }) })
  const save = toSave.value
  showToast(
    `${what} ${t(save ? 'search.undoNotSaved' : 'search.undo')}`,
    { timeout: 10000, ...(save ? { action: { label: t('search.saveAll'), run: saveAll } } : {}) },
  )
}

async function onReplaceAll() {
  if (!results.value.length || replacing.value) return
  const n = totalMatches.value
  const files = t('search.files', { count: results.value.length })
  const question = search.replace
    ? t('search.confirmReplace', { count: n, files, text: search.replace })
    : t('search.confirmDelete', { count: n, files })
  if (!confirm(question)) return
  replacing.value = true
  try {
    afterReplace(await replaceAll(results.value.map((r) => r.target), search.query, options.value, search.replace))
  } catch (e) {
    showToast(t('search.replaceFailed', { error: e.message }))
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
    showToast(t('search.replaceInFailed', { name: r.target.name, error: e.message }))
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
    <h1 class="search-title">{{ t('app.search') }}</h1>
    <div class="findbar search-form" role="search">
      <div class="find-row">
        <button
          class="icon"
          :aria-pressed="search.showReplace"
          :aria-label="t(search.showReplace ? 'search.hideReplace' : 'find.showReplace')"
          :title="t('find.replace')"
          @click="search.showReplace = !search.showReplace"
        >
          {{ search.showReplace ? '▾' : '▸' }}
        </button>
        <input
          ref="queryInput"
          v-model="search.query"
          type="search"
          :placeholder="t(search.regex ? 'search.placeholderRegex' : 'search.placeholder')"
          :aria-label="t('app.search')"
          spellcheck="false"
          autocomplete="off"
          :class="{ invalid: !!error }"
          :aria-invalid="!!error"
          @keydown="onQueryKey"
        />
        <button class="icon" :aria-pressed="search.matchCase" :title="t('find.matchCaseTitle')" :aria-label="t('find.matchCase')" @click="search.matchCase = !search.matchCase">Aa</button>
        <button class="icon" :aria-pressed="search.wholeWord" :title="t('find.wholeWordTitle')" :aria-label="t('find.wholeWord')" @click="search.wholeWord = !search.wholeWord"><u>ab</u></button>
        <button class="icon mono" :aria-pressed="search.regex" :title="t('find.regexTitle')" :aria-label="t('find.regex')" @click="search.regex = !search.regex">.*</button>
      </div>
      <div v-if="search.showReplace" class="find-row">
        <span class="icon-spacer" />
        <input
          v-model="search.replace"
          :placeholder="t(search.regex ? 'find.replaceWithRegex' : 'find.replaceWith')"
          :aria-label="t('find.replaceWith')"
          spellcheck="false"
        />
        <button :disabled="!results.length || replacing" :title="t('search.replaceAllTitle')" @click="onReplaceAll">{{ t('search.replaceAll') }}</button>
      </div>
      <div class="find-row">
        <span class="icon-spacer" />
        <input
          v-model="search.files"
          class="files-filter"
          :placeholder="t('search.filesPlaceholder')"
          :aria-label="t('search.filesLabel')"
          spellcheck="false"
          autocomplete="off"
        />
        <select v-if="hasFolders" v-model="search.scope" :aria-label="t('search.scopeLabel')" class="scope">
          <option v-for="(label, key) in SCOPES" :key="key" :value="key">{{ label }}</option>
        </select>
      </div>
    </div>

    <div class="search-status">
      <span :class="{ error: !!error }" aria-live="polite">{{ status }}</span>
      <span class="spacer" />
      <button v-if="toSave" class="primary" :title="t('search.saveAllTitle')" @click="saveAll">
        {{ t('search.saveAllCount', { count: toSave }) }}
      </button>
      <button v-if="results.length" class="link" @click="collapseAll">{{ t(allCollapsed ? 'search.expandAll' : 'search.collapseAll') }}</button>
    </div>
    <p v-for="n in notes" :key="n" class="hint search-note">{{ n }}</p>
    <p v-if="!search.query" class="empty search-empty">
      {{ t(hasFolders ? 'search.emptyFolders' : 'search.empty') }}
    </p>

    <ul class="search-results">
      <li v-for="r in results" :key="r.target.key" class="search-file">
        <div class="search-file-head">
          <button class="link search-toggle" :aria-expanded="!r.collapsed" @click="toggle(r)">
            {{ r.collapsed ? '▸' : '▾' }} <strong>{{ r.target.name }}</strong>
            <span class="search-folder">{{ r.target.folder }}</span>
          </button>
          <span class="search-count">{{ formatNumber(r.matches.length) }}</span>
          <button v-if="search.showReplace" class="mini" :disabled="replacing" :title="t('search.replaceIn', { name: r.target.name })" @click="onReplaceIn(r)">{{ t('find.replace') }}</button>
          <button class="mini" :title="t('search.hide', { name: r.target.name })" :aria-label="t('search.hide', { name: r.target.name })" @click="dismiss(r)">×</button>
        </div>
        <ul v-if="!r.collapsed" class="search-lines">
          <li v-for="m in r.matches" :key="m.from">
            <button class="search-line" :title="t('search.lineColumn', { line: m.line, col: m.col })" @click="openMatch(r, m)">
              <span class="search-ln">{{ lineLabel(m) }}</span>
              <span class="search-preview">{{ m.before }}<mark :class="{ replaced: search.showReplace }">{{ m.text }}</mark><ins v-if="search.showReplace && !search.regex">{{ search.replace }}</ins>{{ m.after }}</span>
            </button>
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>
