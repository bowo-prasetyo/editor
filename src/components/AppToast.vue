<script setup>
import { toast, dismissToast } from '../toast'
import { t } from '../i18n'

function run() {
  toast.current?.action?.run()
  dismissToast()
}
</script>

<template>
  <div v-if="toast.current" :key="toast.current.id" class="toast" role="status">
    <span>{{ toast.current.message }}</span>
    <button v-if="toast.current.action" @click="run">{{ toast.current.action.label }}</button>
    <button class="icon" :aria-label="t('common.dismiss')" @click="dismissToast">✕</button>
  </div>
</template>
