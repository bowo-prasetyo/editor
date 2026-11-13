<script setup>
import { computed, onMounted, ref } from 'vue'
import { SHORTCUTS, keyLabel } from '../keys'

// Every keyboard shortcut, grouped, with a filter.
const emit = defineEmits(['close'])
const query = ref('')
const input = ref(null)

const groups = computed(() => {
  const q = query.value.trim().toLowerCase()
  const out = new Map()
  for (const s of SHORTCUTS) {
    const keys = s.keys.map((k) => keyLabel(k))
    if (q && !s.label.toLowerCase().includes(q) && !keys.join(' ').toLowerCase().includes(q)) continue
    if (!out.has(s.group)) out.set(s.group, [])
    out.get(s.group).push({ ...s, labels: keys })
  }
  return [...out]
})

onMounted(() => input.value?.focus())
</script>

<template>
  <div class="quick-backdrop" @mousedown.self="emit('close')" @keydown.esc.prevent="emit('close')">
    <div class="quick shortcuts" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div class="shortcuts-head">
        <h2>Keyboard shortcuts</h2>
        <button class="icon" aria-label="Close" title="Close (Esc)" @click="emit('close')">✕</button>
      </div>
      <input ref="input" v-model="query" class="quick-input" placeholder="Filter shortcuts" aria-label="Filter shortcuts" />
      <div class="shortcuts-body">
        <p v-if="!groups.length" class="hint">No shortcuts match “{{ query }}”.</p>
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
        <p class="hint">Run any action by name with the command palette.</p>
      </div>
    </div>
  </div>
</template>
