<script setup>
import { onMounted, ref } from 'vue'
import { useModal } from '../modal'
import { t } from '../i18n'

// Closing a folder that has files with unsaved changes: save them all, keep
// them as drafts, or cancel. Nothing unsaved is ever thrown away.
const props = defineProps({
  folder: { type: String, required: true },
  files: { type: Array, required: true }, // names of the files with unsaved changes
  busy: { type: Boolean, default: false }, // saving
})
const emit = defineEmits(['save', 'keep', 'cancel'])
const first = ref(null)
const root = ref(null)
useModal(root, { onEscape: () => !props.busy && emit('cancel') })
onMounted(() => first.value?.focus())
</script>

<template>
  <div class="quick-backdrop" @mousedown.self="!busy && emit('cancel')">
    <div ref="root" class="quick dialog" role="dialog" aria-modal="true" :aria-label="t('closeFolder.label', { folder })">
      <h2 class="dialog-title">
        {{ t('closeFolder.title', { folder, count: files.length }) }}
      </h2>
      <ul class="close-files">
        <li v-for="f in files.slice(0, 8)" :key="f">{{ f }}</li>
        <li v-if="files.length > 8" class="hint">{{ t('common.andMore', { count: files.length - 8 }) }}</li>
      </ul>
      <p class="hint dialog-hint">
        {{ t('closeFolder.hint') }}
      </p>
      <div class="dialog-actions">
        <button type="button" :disabled="busy" @click="emit('cancel')">{{ t('common.cancel') }}</button>
        <button type="button" :disabled="busy" @click="emit('keep')">{{ t('closeFolder.keep') }}</button>
        <button ref="first" type="button" class="primary" :disabled="busy" @click="emit('save')">
          {{ busy ? t('common.saving') : t('closeFolder.saveAll') }}
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
