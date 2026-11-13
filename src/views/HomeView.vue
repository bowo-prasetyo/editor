<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  state,
  createDoc,
  moveToFolder,
  requestPersistence,
  storageEstimate,
  deleteDoc,
  downloadBackup,
  emptyTrash,
  importBackup,
  restoreDoc,
  trashDoc,
  setDocOptions,
  TRASH_DAYS,
} from '../store'
import { displayName } from '../naming'
import { openFiles, TEXT_ACCEPT } from '../openFiles'
import { canSaveInPlace, pickFiles } from '../fileaccess'
import { canOpenFolder, openFolder } from '../workspace'
import { showToast } from '../toast'
import { prefs } from '../prefs'
import { SORTS, labelsOf, sortDocs } from '../folders'
import { togglePin } from '../drafts'
import { forgetRecentFile, recentFiles } from '../recent'
import { folderNote, downloadsNote, savesAsDownloads } from '../platform'
import { keyLabel } from '../keys'
import { formatBytes, formatDateTime } from '../locale'
import { t } from '../i18n'
import T from '../components/T'

const router = useRouter()
const fileInput = ref(null)
const backupInput = ref(null)
const query = ref('')

// Drafts only: files from open folders are in the sidebar, not here
// (see docs/files-and-drafts.md).
const live = computed(() => state.docs.filter((d) => !d.deletedAt && d.kind !== 'file'))

// What this browser can do (see platform.js): Firefox and Safari can't open
// folders, and Save downloads a copy there. Said once, plainly.
const canFolders = canOpenFolder()
const showDownloadsNote = computed(() => savesAsDownloads() && !prefs.downloadsNoteSeen)
const dismissDownloadsNote = () => (prefs.downloadsNoteSeen = true)

// Files opened on their own, most recent first (see recent.js).
const recent = computed(() => {
  void state.docs.length // re-evaluate when documents come and go
  return recentFiles()
})
async function forgetFile(f) {
  if (await forgetRecentFile(f.id)) showToast(t('home.recentRemoved', { name: displayName(f.name) }))
}

// Copies of files kept by Plumb before it kept files and drafts apart (see
// migrate.js): offered to the Trash once.
const copies = computed(() => live.value.filter((d) => d.copyOf))
function trashCopies() {
  const list = copies.value.map((d) => d.id)
  for (const id of list) trashDoc(id)
  forgetCopies(list)
  showToast(t('home.copiesTrashed', { count: list.length }), {
    action: { label: t('common.undo'), run: () => list.forEach((id) => restoreDoc(id)) },
    timeout: 10000,
  })
}
const forgetCopies = (ids = copies.value.map((d) => d.id)) => ids.forEach((id) => setDocOptions(id, { copyOf: undefined }))

// --- Labels, pinning and sorting ------------------------------------------------

// Labels: the folders drafts were filed in before Plumb kept files and
// drafts apart. They can be filtered by and removed, not made (see folders.js).
const labels = computed(() => labelsOf(live.value))
const label = computed({
  get: () => (labels.value.some((l) => l.label === prefs.labelView) ? prefs.labelView : ''),
  set: (v) => (prefs.labelView = v),
})
const inView = computed(() => (label.value ? live.value.filter((d) => d.folder === label.value) : live.value))
function removeLabel(doc) {
  const old = doc.folder
  moveToFolder(doc.id, '')
  showToast(t('home.labelRemoved', { label: old, name: displayName(doc.name) }), {
    action: { label: t('common.undo'), run: () => moveToFolder(doc.id, old) },
  })
}

// Filter by name or content, ignoring case; pinned drafts first.
const docs = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = q
    ? inView.value.filter((d) => d.name.toLowerCase().includes(q) || d.content.toLowerCase().includes(q))
    : inView.value
  return sortDocs(list, prefs.sort)
})

const trash = computed(() =>
  state.docs.filter((d) => d.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt),
)
const showTrash = ref(false)

// Nothing here yet: no drafts, recent files, Trash or open folders.
const firstVisit = computed(
  () => !live.value.length && !recent.value.length && !trash.value.length && !prefs.workspaces.length,
)
const saveKey = keyLabel('Mod+S')
const canSaveFiles = canSaveInPlace()

function newDoc() {
  const doc = createDoc()
  requestPersistence()
  router.push({ name: 'edit', params: { id: doc.id } })
}

// Where the browser can, open through its file picker so the documents stay
// linked to their files and Save writes back to them.
async function openPicker() {
  if (!canSaveInPlace()) return fileInput.value.click()
  try {
    const picked = await pickFiles()
    if (picked.length) await openFiles(picked, router)
  } catch (e) {
    showToast(t('home.cantOpenFiles', { error: e.message }))
  }
}

// A folder from disk: its files show in the sidebar (Chrome, Edge).
async function onOpenFolder() {
  try {
    const w = await openFolder()
    if (w) showToast(t('home.folderOpened', { name: w.name }), { timeout: 5000 })
  } catch (e) {
    showToast(t('app.cantOpenFolder', { error: e.message }))
  }
}

async function onFiles(e) {
  const files = [...e.target.files]
  e.target.value = ''
  await openFiles(files, router)
}

async function onBackup(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    const { added, skipped } = importBackup(JSON.parse(await file.text()))
    showToast(
      !added
        ? t('home.backupNothing', { count: skipped })
        : t('home.backupRestored', { count: added }) + (skipped ? ` ${t('home.backupSkipped', { count: skipped })}` : ''),
    )
  } catch (err) {
    showToast(err instanceof SyntaxError ? t('home.notBackup') : err.message)
  }
}

// Deleting is undoable, so no confirmation dialog: offer Undo instead.
function remove(doc) {
  trashDoc(doc.id)
  showToast(t('home.trashed', { name: displayName(doc.name) }), {
    action: { label: t('common.undo'), run: () => restoreDoc(doc.id) },
    timeout: 8000,
  })
}

function deleteForever(doc) {
  if (confirm(t('home.confirmDelete', { name: displayName(doc.name) }))) deleteDoc(doc.id)
}
function onEmptyTrash() {
  const n = trash.value.length
  if (confirm(t('home.confirmEmptyTrash', { count: n })))
    emptyTrash()
}

// Storage use, shown under the list so people know how much room is left.
const usage = ref(null)
onMounted(async () => {
  const est = await storageEstimate()
  if (est?.quota) usage.value = { used: formatBytes(est.usage ?? 0), quota: formatBytes(est.quota) }
})

const fmt = (t) => formatDateTime(t)
const daysLeft = (d) =>
  Math.max(0, Math.ceil(TRASH_DAYS - (Date.now() - d.deletedAt) / (24 * 60 * 60 * 1000)))
</script>

<template>
  <section class="home">
    <h1 class="sr-only">{{ t('home.heading') }}</h1>
    <div class="actions">
      <button class="primary" @click="newDoc">{{ t('common.newDocument') }}</button>
      <button @click="openPicker">{{ t('home.openFiles') }}</button>
      <!-- Shown even where folders can't be opened, with the reason (see platform.js). -->
      <button
        :disabled="!canFolders"
        :aria-describedby="canFolders ? undefined : 'folder-note'"
        :title="canFolders ? t('home.openFolderTitle') : folderNote()"
        @click="onOpenFolder"
      >
        {{ t('home.openFolder') }}
      </button>
      <input ref="fileInput" type="file" multiple :accept="TEXT_ACCEPT" hidden @change="onFiles" />
      <span class="spacer" />
      <button :title="t('home.exportTitle')" @click="downloadBackup">
        {{ t('home.export') }}
      </button>
      <button :title="t('home.importTitle')" @click="backupInput.click()">
        {{ t('home.import') }}
      </button>
      <input ref="backupInput" type="file" accept=".json,application/json" hidden @change="onBackup" />
    </div>

    <p v-if="!canFolders" id="folder-note" class="hint platform-note">{{ folderNote() }}</p>
    <div v-if="showDownloadsNote" class="banner info platform-banner" role="status">
      <span>{{ downloadsNote() }}</span>
      <span class="banner-actions">
        <button @click="dismissDownloadsNote">{{ t('common.ok') }}</button>
      </span>
    </div>

    <div class="home-body" :class="{ single: firstVisit }">
      <nav v-if="!firstVisit" class="folders" :aria-label="t('home.labels')">
        <button
          class="folder-item"
          :class="{ active: !label }"
          :aria-current="!label ? 'true' : undefined"
          @click="label = ''"
        >
          <span>{{ t('home.allDrafts') }}</span><span class="count">{{ live.length }}</span>
        </button>
        <template v-if="labels.length">
          <p class="hint labels-head">{{ t('home.labels') }}</p>
          <button
            v-for="l in labels"
            :key="l.label"
            class="folder-item"
            :class="{ active: label === l.label }"
            :title="t('home.labelledTitle', { label: l.label })"
            :aria-current="label === l.label ? 'true' : undefined"
            @click="label = l.label"
          >
            <span class="folder-name">{{ l.label }}</span><span class="count">{{ l.count }}</span>
          </button>
        </template>
      </nav>

      <div class="list-pane">
        <div v-if="copies.length" class="banner info" role="status">
          <span>
            <strong>{{ t('home.copies', { count: copies.length }) }}</strong>
            {{ t('home.copiesHint') }}
          </span>
          <span class="banner-actions">
            <button class="primary" @click="trashCopies">{{ t('home.copiesTrash') }}</button>
            <button @click="forgetCopies()">{{ t('home.copiesKeep') }}</button>
            <button :title="t('home.copiesExportTitle')" @click="downloadBackup">{{ t('home.copiesExport') }}</button>
          </span>
        </div>

        <section v-if="recent.length" class="recent-files" :aria-label="t('home.recentFiles')">
          <h2 class="section-title">{{ t('home.recentFiles') }}</h2>
          <ul class="doc-list">
            <li v-for="f in recent" :key="f.id">
              <RouterLink :to="{ name: 'edit', params: { id: f.id } }" class="doc-link">
                <strong>{{ displayName(f.name) }}</strong>
                <small>
                  <template v-if="f.diskDirty"><span class="unsaved-dot">●</span> {{ t('file.notSaved') }} · </template>
                  {{ t('home.openedAt', { when: fmt(f.openedAt ?? f.updatedAt) }) }}
                </small>
              </RouterLink>
              <button
                v-if="!f.diskDirty"
                class="icon-button"
                :title="t('home.recentRemoveTitle')"
                :aria-label="t('home.recentRemove', { name: displayName(f.name) })"
                @click="forgetFile(f)"
              >
                ✕
              </button>
            </li>
          </ul>
          <h2 class="section-title">{{ t('home.drafts') }}</h2>
        </section>

        <div v-if="live.length" class="list-tools">
          <input
            v-model="query"
            class="filter"
            type="search"
            :placeholder="t('home.filter')"
            :aria-label="t('home.filterLabel')"
          />
          <label class="sort">
            <span class="hint">{{ t('home.sort') }}</span>
            <select v-model="prefs.sort" :aria-label="t('home.sortLabel')">
              <option v-for="(s, key) in SORTS" :key="key" :value="key">{{ s.label }}</option>
            </select>
          </label>
        </div>

        <!-- First visit (nothing here yet): how Plumb works, in three lines. -->
        <div v-if="firstVisit" class="welcome">
          <h2 class="welcome-title">{{ t('home.welcome.title') }}</h2>
          <ul>
            <li><T :k="canSaveFiles ? 'home.welcome.files' : 'home.welcome.filesDownload'" :p="{ key: saveKey }" /></li>
            <li><T k="home.welcome.drafts" /></li>
            <li><T k="home.welcome.private" /></li>
          </ul>
          <p class="hint">{{ t('home.welcome.hint', { key: keyLabel('Mod+P') }) }}</p>
        </div>
        <p v-else-if="!live.length" class="empty">
          {{ t('home.noDrafts') }}
        </p>
        <p v-else-if="!docs.length && query" class="empty">{{ t('home.noMatch', { query }) }}</p>
        <p v-else-if="!docs.length" class="empty">{{ t('home.noLabelled') }}</p>

        <ul v-else class="doc-list">
          <li v-for="doc in docs" :key="doc.id">
            <RouterLink :to="{ name: 'edit', params: { id: doc.id } }" class="doc-link">
              <strong :class="{ untitled: !doc.name?.trim() }">{{ displayName(doc.name) }}</strong>
              <small>{{ fmt(doc.updatedAt) }} · {{ t('common.chars', { count: doc.content.length }) }}</small>
            </RouterLink>
            <span v-if="doc.folder" class="label-chip" :title="t('home.labelTitle', { label: doc.folder })">
              {{ doc.folder }}
              <button
                class="label-remove"
                :aria-label="t('home.removeLabel', { label: doc.folder, name: displayName(doc.name) })"
                :title="t('home.removeLabelTitle')"
                @click="removeLabel(doc)"
              >×</button>
            </span>
            <button
              class="icon-button pin-button"
              :class="{ pinned: doc.pinned }"
              :aria-pressed="!!doc.pinned"
              :title="t(doc.pinned ? 'home.unpin' : 'home.pinTitle')"
              :aria-label="t(doc.pinned ? 'home.unpinName' : 'home.pinName', { name: displayName(doc.name) })"
              @click="togglePin(doc.id)"
            >
              📌
            </button>
            <button
              class="danger"
              :title="t('home.trash', { name: displayName(doc.name) })"
              :aria-label="t('home.trash', { name: displayName(doc.name) })"
              @click="remove(doc)"
            >
              ✕
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- Only once there's something stored: on a first visit it's just alarming. -->
    <p v-if="state.backend && !firstVisit" class="hint storage-info">
      <template v-if="state.backend === 'localStorage'">
        {{ t('home.storageLocal') }}
      </template>
      <template v-else>{{ usage ? t('home.storageUsage', usage) : t('home.storage') }}</template>
      <template v-if="!state.persisted"> {{ t('home.storageNotPersisted') }}</template>
    </p>

    <div v-if="trash.length" class="trash">
      <div class="trash-head">
        <button class="link" :aria-expanded="showTrash" @click="showTrash = !showTrash">
          {{ showTrash ? '▾' : '▸' }} {{ t('home.trashCount', { count: trash.length }) }}
        </button>
        <button v-if="showTrash" class="danger" @click="onEmptyTrash">{{ t('home.emptyTrash') }}</button>
      </div>
      <template v-if="showTrash">
        <p class="hint">{{ t('home.trashNote', { count: TRASH_DAYS }) }}</p>
        <ul class="doc-list">
          <li v-for="doc in trash" :key="doc.id">
            <RouterLink :to="{ name: 'edit', params: { id: doc.id } }" class="doc-link">
              <strong>{{ displayName(doc.name) }}</strong>
              <small>{{ t('home.deletedAt', { when: fmt(doc.deletedAt) }) }} · {{ t('home.daysLeft', { count: daysLeft(doc) }) }}</small>
            </RouterLink>
            <button @click="restoreDoc(doc.id)">{{ t('common.restore') }}</button>
            <button class="danger" @click="deleteForever(doc)">{{ t('home.deleteForever') }}</button>
          </li>
        </ul>
      </template>
    </div>


  </section>
</template>
