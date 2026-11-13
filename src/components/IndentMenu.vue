<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { SIZES, describeIndent } from '../indentation'

// Status-bar menu: how this document is indented, and converting it.
const props = defineProps({
  indent: { type: Object, required: true }, // { type, size, auto }
  detected: { type: Object, required: true }, // what auto-detect gives
})
const emit = defineEmits(['set', 'convert']) // set(null = auto | { type, size }), convert('tabs' | 'spaces')
const open = ref(false)
const root = ref(null)

const is = (type, size) => !props.indent.auto && props.indent.type === type && props.indent.size === size
function choose(value) {
  open.value = false
  emit('set', value)
}
function convert(type) {
  open.value = false
  emit('convert', type)
}
const outside = (e) => open.value && !root.value?.contains(e.target) && (open.value = false)
onMounted(() => document.addEventListener('mousedown', outside))
onBeforeUnmount(() => document.removeEventListener('mousedown', outside))
</script>

<template>
  <span ref="root" class="indent-menu" @keydown.esc.stop="open = false">
    <button
      class="mini position"
      :aria-expanded="open"
      aria-haspopup="menu"
      title="Indentation: what Tab inserts and how wide tabs are"
      @click="open = !open"
    >
      {{ describeIndent(indent) }}{{ indent.auto ? '' : ' ✱' }}
    </button>
    <div v-if="open" class="menu" role="menu">
      <button role="menuitemradio" :aria-checked="indent.auto" @click="choose(null)">
        Detect from the file ({{ describeIndent(detected) }})
      </button>
      <hr />
      <button v-for="n in SIZES" :key="'s' + n" role="menuitemradio" :aria-checked="is('spaces', n)" @click="choose({ type: 'spaces', size: n })">
        Spaces: {{ n }}
      </button>
      <button v-for="n in SIZES" :key="'t' + n" role="menuitemradio" :aria-checked="is('tabs', n)" @click="choose({ type: 'tabs', size: n })">
        Tabs, {{ n }} wide
      </button>
      <hr />
      <button role="menuitem" @click="convert('spaces')">Convert indentation to spaces ({{ indent.type === 'spaces' ? indent.size : detected.size }})</button>
      <button role="menuitem" @click="convert('tabs')">Convert indentation to tabs</button>
    </div>
  </span>
</template>
