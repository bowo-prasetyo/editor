<script setup>
import { onMounted, ref } from 'vue'

// Ctrl/Cmd+G: jump to a line, or line:column.
const props = defineProps({
  editor: { type: Object, default: null }, // see createEditor() in cm.js
  lines: { type: Number, required: true },
})
const emit = defineEmits(['close'])
const input = ref(null)
const value = ref('')
const error = ref('')

function go() {
  if (props.editor?.goTo(value.value)) emit('close', { refocus: false })
  else error.value = 'Type a line number'
}

onMounted(() => input.value?.focus())
</script>

<template>
  <div class="findbar" role="search" @keydown.esc.prevent="emit('close', { refocus: true })">
    <div class="find-row">
      <label class="goto-label" for="goto-input">Go to line</label>
      <input
        id="goto-input"
        ref="input"
        v-model="value"
        inputmode="numeric"
        autocomplete="off"
        spellcheck="false"
        :placeholder="`1–${lines}, or line:column`"
        @input="error = ''"
        @keydown.enter.prevent="go"
      />
      <span class="find-count" aria-live="polite">{{ error }}</span>
      <button @click="go">Go</button>
      <button class="icon" title="Close (Esc)" aria-label="Close go to line" @click="emit('close', { refocus: true })">✕</button>
    </div>
  </div>
</template>
