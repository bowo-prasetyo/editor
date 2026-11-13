<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { SIZES, describeIndent } from '../indentation'
import { t } from '../i18n'

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
      :title="t('indent.title')"
      @click="open = !open"
    >
      {{ describeIndent(indent) }}{{ indent.auto ? '' : ' ✱' }}{{ indent.auto && indent.from === 'editorconfig' ? ' · .editorconfig' : '' }}
    </button>
    <div v-if="open" class="menu" role="menu">
      <button role="menuitemradio" :aria-checked="indent.auto" @click="choose(null)">
        {{ t(detected.from === 'editorconfig' ? 'indent.fromEditorconfig' : 'indent.detect', { indent: describeIndent(detected) }) }}
      </button>
      <hr />
      <button v-for="n in SIZES" :key="'s' + n" role="menuitemradio" :aria-checked="is('spaces', n)" @click="choose({ type: 'spaces', size: n })">
        {{ t('indent.spacesN', { count: n }) }}
      </button>
      <button v-for="n in SIZES" :key="'t' + n" role="menuitemradio" :aria-checked="is('tabs', n)" @click="choose({ type: 'tabs', size: n })">
        {{ t('indent.tabsN', { count: n }) }}
      </button>
      <hr />
      <button role="menuitem" @click="convert('spaces')">{{ t('indent.convertSpaces', { count: indent.type === 'spaces' ? indent.size : detected.size }) }}</button>
      <button role="menuitem" @click="convert('tabs')">{{ t('indent.convertTabs') }}</button>
    </div>
  </span>
</template>
