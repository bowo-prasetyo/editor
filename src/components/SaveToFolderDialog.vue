<script setup>
import { onMounted, ref } from 'vue'
import { useModal } from '../modal'
import { t } from '../i18n'

// "Save to folder…": where to save a draft, as a file in an open folder.
const props = defineProps({
  name: { type: String, required: true }, // the draft's name, suggested as the file name
  folders: { type: Array, required: true }, // [{ id, name }] open folders
  error: { type: String, default: '' },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['submit', 'cancel'])
const rootId = ref(props.folders[0]?.id ?? '')
const path = ref(props.name)
const input = ref(null)
const root = ref(null)
useModal(root, { onEscape: () => !props.busy && emit('cancel') })

onMounted(() => {
  input.value?.focus()
  // Select the name without its extension, ready to type over.
  const dot = path.value.lastIndexOf('.')
  input.value?.setSelectionRange(0, dot > 0 ? dot : path.value.length)
})
</script>

<template>
  <div class="quick-backdrop" @mousedown.self="!busy && emit('cancel')">
    <form
      ref="root"
      class="quick dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('saveToFolder.title')"
      @submit.prevent="emit('submit', { rootId, path })"
    >
      <h2 class="dialog-title">{{ t('saveToFolder.title') }}</h2>
      <label v-if="folders.length > 1" class="dialog-field">
        <span class="hint">{{ t('saveToFolder.folder') }}</span>
        <select v-model="rootId" :aria-label="t('saveToFolder.folder')">
          <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </label>
      <input
        ref="input"
        v-model="path"
        class="quick-input"
        autocomplete="off"
        spellcheck="false"
        :aria-label="t('saveToFolder.fileName')"
        :placeholder="t('saveToFolder.placeholder', { folder: folders.find((f) => f.id === rootId)?.name ?? t('saveToFolder.theFolder') })"
      />
      <p v-if="error" class="dialog-error" role="alert">{{ error }}</p>
      <p v-else class="hint dialog-hint">
        {{ t('saveToFolder.hint', { folder: folders.find((f) => f.id === rootId)?.name }) }}
      </p>
      <div class="dialog-actions">
        <button type="button" :disabled="busy" @click="emit('cancel')">{{ t('common.cancel') }}</button>
        <button type="submit" class="primary" :disabled="busy">{{ t('common.save') }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.dialog-field {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.dialog-error {
  color: var(--danger);
  margin: 8px 0 0;
}
</style>
