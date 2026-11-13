<script setup>
import { onMounted, ref } from 'vue'

// Closing a folder that has files with unsaved changes: save them all, keep
// them as drafts, or cancel. Nothing unsaved is ever thrown away.
defineProps({
  folder: { type: String, required: true },
  files: { type: Array, required: true }, // names of the files with unsaved changes
  busy: { type: Boolean, default: false }, // saving
})
const emit = defineEmits(['save', 'keep', 'cancel'])
const first = ref(null)
onMounted(() => first.value?.focus())
</script>

<template>
  <div class="quick-backdrop" @mousedown.self="!busy && emit('cancel')" @keydown.esc.prevent="!busy && emit('cancel')">
    <div class="quick dialog" role="dialog" aria-modal="true" :aria-label="`Close ${folder}`">
      <h2 class="dialog-title">
        “{{ folder }}” has {{ files.length === 1 ? '1 file' : `${files.length} files` }} with unsaved changes
      </h2>
      <ul class="close-files">
        <li v-for="f in files.slice(0, 8)" :key="f">{{ f }}</li>
        <li v-if="files.length > 8" class="hint">and {{ files.length - 8 }} more</li>
      </ul>
      <p class="hint dialog-hint">
        Save them to disk, or keep them as drafts: open the folder again later to put the edits back.
      </p>
      <div class="dialog-actions">
        <button type="button" :disabled="busy" @click="emit('cancel')">Cancel</button>
        <button type="button" :disabled="busy" @click="emit('keep')">Keep as drafts</button>
        <button ref="first" type="button" class="primary" :disabled="busy" @click="emit('save')">
          {{ busy ? 'Saving…' : 'Save all to disk' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.close-files {
  margin: 8px 0;
  padding-left: 20px;
  max-height: 12em;
  overflow: auto;
  font-family: var(--mono, monospace);
  font-size: 0.9em;
}
</style>
