<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { createDoc, getDoc, requestPersistence } from '../store'
import { displayName } from '../naming'
import { liveTabs } from '../session'
import { closeDocTab } from '../closetab'

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

const close = (id) => closeDocTab(router, id, props.active)

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
    strip.value?.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  },
  { immediate: true },
)
</script>

<template>
  <nav class="tabbar" aria-label="Open documents">
    <!-- A list of links (the current one is aria-current), each with its own
         close button: not ARIA tabs, which can't hold a second control. -->
    <ul ref="strip" class="tabs">
      <li
        v-for="d in shown"
        :key="d.id"
        class="tab"
        :class="{ active: d.id === active, trashed: d.deletedAt }"
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
      </li>
    </ul>
    <button class="tab-new" title="New document" aria-label="New document" @click="newTab">+</button>
  </nav>
</template>
