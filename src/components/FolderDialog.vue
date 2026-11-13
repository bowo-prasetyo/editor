<script setup>
import { onMounted, ref } from 'vue'
import { normalizeFolder } from '../folders'

// Ask for a folder path ("Work/Clients"), suggesting existing folders.
// Used for New folder, Rename folder and Move to folder.
const props = defineProps({
  title: { type: String, required: true },
  initial: { type: String, default: '' },
  folders: { type: Array, default: () => [] }, // existing folder paths
  confirm: { type: String, default: 'OK' },
  allowEmpty: { type: Boolean, default: false }, // "" means no folder
  hint: { type: String, default: 'Use / for a folder inside another, e.g. Work/Clients.' },
})
const emit = defineEmits(['submit', 'cancel'])
const value = ref(props.initial)
const input = ref(null)

function submit() {
  const path = normalizeFolder(value.value)
  if (!path && !props.allowEmpty) return input.value?.focus()
  emit('submit', path)
}

onMounted(() => {
  input.value?.focus()
  input.value?.select()
})
</script>

<template>
  <div class="quick-backdrop" @mousedown.self="emit('cancel')" @keydown.esc.prevent="emit('cancel')">
    <form class="quick dialog" role="dialog" aria-modal="true" :aria-label="title" @submit.prevent="submit">
      <h2 class="dialog-title">{{ title }}</h2>
      <input
        ref="input"
        v-model="value"
        class="quick-input"
        list="folder-suggestions"
        autocomplete="off"
        spellcheck="false"
        :placeholder="allowEmpty ? 'Folder (leave empty for none)' : 'Folder name'"
        aria-label="Folder"
      />
      <datalist id="folder-suggestions">
        <option v-for="f in folders" :key="f" :value="f" />
      </datalist>
      <p class="hint dialog-hint">{{ hint }}</p>
      <div class="dialog-actions">
        <button type="button" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="primary">{{ confirm }}</button>
      </div>
    </form>
  </div>
</template>
