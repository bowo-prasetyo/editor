<script setup>
import { computed, onMounted, ref } from 'vue'
import { SHORTCUTS, SHORTCUT_GROUPS, keyLabel } from '../keys'
import { useModal } from '../modal'
import { t } from '../i18n'

// Every keyboard shortcut, grouped, with a filter.
const emit = defineEmits(['close'])
const query = ref('')
const input = ref(null)
const root = ref(null)
useModal(root, { onEscape: () => emit('close') })

const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  const out = new Map()
  for (const s of SHORTCUTS) {
    const keys = s.keys.map((k) => keyLabel(k))
    if (q && !s.label.toLowerCase().includes(q) && !keys.join(' ').toLowerCase().includes(q)) continue
    if (!out.has(s.group)) out.set(s.group, [])
    out.get(s.group).push({ ...s, labels: keys })
  }
  return [...out].map(([id, items]) => [SHORTCUT_GROUPS[id] ?? id, items])
})

onMounted(() => input.value?.focus())
</script>

<template>
  <div class="quick-backdrop" @mousedown.self="emit('close')">
    <div ref="root" class="quick shortcuts" role="dialog" aria-modal="true" :aria-label="t('shortcuts.title')">
      <div class="shortcuts-head">
        <h2>{{ t('shortcuts.title') }}</h2>
        <button class="icon" :aria-label="t('common.close')" :title="t('common.closeEsc')" @click="emit('close')">✕</button>
      </div>
      <input ref="input" v-model="query" class="quick-input" :placeholder="t('shortcuts.filter')" :aria-label="t('shortcuts.filter')" />
      <!-- Focusable, so the list scrolls from the keyboard too. -->
      <div class="shortcuts-body" tabindex="0" role="region" :aria-label="t('shortcuts.title')">
        <p v-if="!groups.length" class="hint">{{ t('shortcuts.noMatch', { query }) }}</p>
        <section v-for="[group, items] in groups" :key="group">
          <h3>{{ group }}</h3>
          <dl>
            <template v-for="s in items" :key="s.id">
              <dt>{{ s.label }}</dt>
              <dd>
                <template v-for="(k, i) in s.labels" :key="k">
                  <span v-if="i" class="hint"> / </span><kbd>{{ k }}</kbd>
                </template>
              </dd>
            </template>
          </dl>
        </section>
        <p class="hint">{{ t('shortcuts.paletteHint') }}</p>
      </div>
    </div>
  </div>
</template>
