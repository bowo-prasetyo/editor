<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppToast from './components/AppToast.vue'
import { openFiles } from './openFiles'
import { droppedHandles } from './fileaccess'

// Drop files anywhere in the app to open them.
const router = useRouter()
const dragging = ref(false)
let depth = 0
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files')

function onDragEnter(e) {
  if (!hasFiles(e)) return
  depth++
  dragging.value = true
}
function onDragLeave(e) {
  if (!hasFiles(e)) return
  depth = Math.max(0, depth - 1)
  if (!depth) dragging.value = false
}
function onDragOver(e) {
  if (hasFiles(e)) e.preventDefault()
}
function onDrop(e) {
  if (!hasFiles(e)) return
  e.preventDefault()
  depth = 0
  dragging.value = false
  const files = [...e.dataTransfer.files]
  // Handles (where offered) let Save write back to the dropped files. They
  // must be requested now, before the drop event is over.
  const handles = droppedHandles(e.dataTransfer)
  if (!handles) return openFiles(files, router)
  handles.then((hs) =>
    openFiles(files.map((file, i) => ({ file, handle: hs[i]?.kind === 'file' ? hs[i] : null })), router),
  )
}

const events = { dragenter: onDragEnter, dragleave: onDragLeave, dragover: onDragOver, drop: onDrop }
onMounted(() => Object.entries(events).forEach(([k, f]) => window.addEventListener(k, f)))
onBeforeUnmount(() => Object.entries(events).forEach(([k, f]) => window.removeEventListener(k, f)))
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="brand">📝 Editor</RouterLink>
    <span class="hint">Everything is saved in your browser</span>
  </header>
  <main>
    <RouterView />
  </main>
  <div v-if="dragging" class="drop-overlay" aria-hidden="true">
    <div>Drop files to open them</div>
  </div>
  <AppToast />
</template>
