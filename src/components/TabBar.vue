<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { createDoc, getDoc, requestPersistence } from '../store'
import { displayName } from '../naming'
import { closeTab, liveTabs } from '../session'

// Tabs for the open documents. Middle-click or × closes one; closing the
// active tab shows its neighbour (or the document list).
const props = defineProps({ active: { type: String, required: true } })
const router = useRouter()
const strip = ref(null)

const tabs = computed(() =>
  liveTabs()
    .map((id) => getDoc(id))
    .filter(Boolean),
)
// The active document even if it isn't a live tab (e.g. opened from the Trash).
const shown = computed(() =>
  tabs.value.some((d) => d.id === props.active) ? tabs.value : [...tabs.value, getDoc(props.active)].filter(Boolean),
)

function close(id) {
  const next = closeTab(id)
  if (id !== props.active) return
  if (next) router.push({ name: 'edit', params: { id: next } })
  else router.push({ name: 'home' })
}

function newTab() {
  const doc = createDoc()
  requestPersistence()
  router.push({ name: 'edit', params: { id: doc.id } })
}

// Keep the active tab in view.
watch(
  () => props.active,
  async () => {
    await nextTick()
    strip.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  },
  { immediate: true },
)
</script>

<template>
  <nav class="tabbar" aria-label="Open documents">
    <div ref="strip" class="tabs" role="tablist">
      <div
        v-for="d in shown"
        :key="d.id"
        class="tab"
        :class="{ active: d.id === active, trashed: d.deletedAt }"
        role="tab"
        :aria-selected="d.id === active"
        :title="(d.folder ? d.folder + '/' : '') + displayName(d.name)"
        @auxclick.prevent="$event.button === 1 && close(d.id)"
        @mousedown.middle.prevent
      >
        <RouterLink :to="{ name: 'edit', params: { id: d.id } }" class="tab-link">
          <span class="tab-name">{{ displayName(d.name) }}</span>
          <span v-if="d.linked && d.diskDirty" class="tab-dirty" title="Not saved to file">●</span>
        </RouterLink>
        <button class="tab-close" :aria-label="`Close ${displayName(d.name)}`" title="Close tab (middle-click)" @click="close(d.id)">
          ×
        </button>
      </div>
    </div>
    <button class="tab-new" title="New document" aria-label="New document" @click="newTab">+</button>
  </nav>
</template>
