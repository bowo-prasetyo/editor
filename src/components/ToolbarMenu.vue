<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

// A button that opens a short menu of actions, for toolbars too narrow to
// show them all. Items: { id, label, run(), checked? } — `checked` (true or
// false) makes it an on/off item.
//
// Keys: Enter, Space or ↓ opens it on the first item; ↑ and ↓ move;
// Home and End jump; Escape and Tab close it (Escape returns to the button).
defineProps({
  label: { type: String, default: 'More' },
  title: { type: String, default: '' },
  items: { type: Array, required: true },
})
const open = ref(false)
const root = ref(null)
const button = ref(null)
const menu = ref(null)
// Opens under the button's left edge, or its right one if that would run off screen.
const alignEnd = ref(false)

const entries = () => [...(menu.value?.querySelectorAll('[role^="menuitem"]') ?? [])]
async function show(focusAt = 0) {
  alignEnd.value = false
  open.value = true
  await nextTick()
  alignEnd.value = menu.value?.getBoundingClientRect().right > document.documentElement.clientWidth - 8
  const list = entries()
  list.at(focusAt)?.focus()
}
function hide(refocus = true) {
  open.value = false
  if (refocus) button.value?.focus()
}
function choose(item) {
  hide()
  item.run()
}

function onButtonKey(e) {
  if (e.key === 'ArrowDown') show(0)
  else if (e.key === 'ArrowUp') show(-1)
  else return
  e.preventDefault()
}
function onMenuKey(e) {
  const list = entries()
  const i = list.indexOf(document.activeElement)
  if (e.key === 'ArrowDown') list[(i + 1) % list.length]?.focus()
  else if (e.key === 'ArrowUp') list[(i - 1 + list.length) % list.length]?.focus()
  else if (e.key === 'Home') list[0]?.focus()
  else if (e.key === 'End') list.at(-1)?.focus()
  else if (e.key === 'Escape') {
    e.stopPropagation()
    hide()
  } else if (e.key === 'Tab') return hide(false)
  else return
  e.preventDefault()
}

const outside = (e) => open.value && !root.value?.contains(e.target) && hide(false)
onMounted(() => document.addEventListener('mousedown', outside))
onBeforeUnmount(() => document.removeEventListener('mousedown', outside))
</script>

<template>
  <span ref="root" class="toolbar-menu">
    <button
      ref="button"
      :aria-expanded="open"
      aria-haspopup="menu"
      :title="title || undefined"
      @click="open ? hide() : show()"
      @keydown="onButtonKey"
    >
      {{ label }} <span aria-hidden="true">▾</span>
    </button>
    <div v-if="open" ref="menu" class="menu menu-down" :class="{ 'align-end': alignEnd }" role="menu" :aria-label="label" @keydown="onMenuKey">
      <button
        v-for="item in items"
        :key="item.id"
        :role="item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'"
        :aria-checked="item.checked === undefined ? undefined : !!item.checked"
        tabindex="-1"
        @click="choose(item)"
      >
        {{ item.label }}
      </button>
    </div>
  </span>
</template>
