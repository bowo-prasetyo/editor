import { reactive } from 'vue'

// One short message at a time, at the bottom of the screen, with an
// optional action button (e.g. Undo).
export const toast = reactive({ current: null })
let timer

export function showToast(message, { action = null, timeout = 6000 } = {}) {
  clearTimeout(timer)
  toast.current = { message, action, id: Date.now() }
  timer = setTimeout(() => (toast.current = null), timeout)
}

export function dismissToast() {
  clearTimeout(timer)
  toast.current = null
}
