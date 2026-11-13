<script setup>
// Shown in place of the editor while a file's text is being read from disk
// (see readFileText in workspace.js). Files with no unsaved changes aren't
// kept in the browser, so after a reload the browser may first need the
// user's permission to read the folder again.
import { computed, ref, watch } from 'vue'
import { prefs } from '../prefs'
import { readFileText, reconnect, requestFileAccess } from '../workspace'
import { displayName } from '../naming'

const props = defineProps({ doc: { type: Object, required: true } })
const state = ref('reading') // 'reading' | 'needs-access' | 'missing'
const folder = computed(() => prefs.workspaces.find((w) => w.id === props.doc.source?.root)?.name ?? 'its folder')
const name = computed(() => displayName(props.doc.name))

async function read() {
  const id = props.doc.id
  state.value = 'reading'
  const r = await readFileText(id).catch(() => 'missing')
  if (id === props.doc.id && r !== 'ready') state.value = r
}
watch(() => props.doc.id, read, { immediate: true })

// A folder's file: permission for the folder. A file opened on its own: for the file.
async function allow() {
  const root = props.doc.source?.root
  if (root ? await reconnect(root) : await requestFileAccess(props.doc.id)) read()
}
</script>

<template>
  <div class="unread-file" role="status">
    <p v-if="state === 'reading'">Reading “{{ name }}” from disk…</p>
    <template v-else-if="state === 'needs-access'">
      <p>
        <strong>Plumb needs your permission to read “{{ doc.source ? folder : name }}” again.</strong>
        Files with no unsaved changes aren’t kept in the browser: their text is read from disk.
      </p>
      <button class="primary" @click="allow">Allow access</button>
    </template>
    <p v-else>
      <strong>“{{ name }}” can’t be read.</strong> It isn’t on disk any more, or it isn’t a text file.
    </p>
  </div>
</template>

<style scoped>
.unread-file {
  padding: 24px;
  color: var(--muted);
  max-width: 60ch;
}
.unread-file strong {
  color: var(--fg);
}
</style>
