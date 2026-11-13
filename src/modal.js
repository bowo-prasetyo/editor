import { onBeforeUnmount, watch } from 'vue'

// What every modal dialog needs, so the page behind it can't be reached:
//
// - Tab and Shift+Tab cycle through the dialog's own controls. Focus that
//   lands outside it anyway (a click on the page, a script) is brought back.
// - Escape closes it wherever focus is, and never reaches the editor behind.
// - When it closes, focus goes back to where it was when it opened (unless
//   something else, such as a command it ran, has taken focus meanwhile).
//
// `root` is a template ref to the dialog element: the dialog is active while
// the ref holds an element, so this works for dialogs shown with v-if inside
// a component as well as for components that are the dialog.
//
//   const root = ref(null)
//   useModal(root, { onEscape: () => emit('cancel') })
//
// Options:
//   onEscape()    called on Escape (leave it out to ignore Escape)
//   restoreFocus  false when the dialog puts focus back itself (default true)

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

export function focusables(el) {
  return [...el.querySelectorAll(FOCUSABLE)].filter((e) => !e.hidden && e.getClientRects().length > 0)
}

// Dialogs can be stacked (a command palette opening another dialog): only the
// newest one handles keys and focus.
const stack = []

export function useModal(root, { onEscape, restoreFocus = true } = {}) {
  let el = null
  let opener = null

  const top = () => stack[stack.length - 1] === el

  function onKeydown(e) {
    if (!el || !top()) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onEscape?.()
      return
    }
    if (e.key !== 'Tab') return
    const items = focusables(el)
    if (!items.length) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const at = document.activeElement
    const inside = el.contains(at)
    if (!inside || (e.shiftKey && at === first) || (!e.shiftKey && at === last)) {
      e.preventDefault()
      ;(e.shiftKey ? last : first).focus()
    }
  }

  function onFocusIn(e) {
    if (!el || !top() || el.contains(e.target)) return
    ;(focusables(el)[0] ?? el).focus()
  }

  function activate(node) {
    el = node
    // Where focus was before the dialog took it.
    opener = document.activeElement
    stack.push(el)
    document.addEventListener('keydown', onKeydown, true)
    document.addEventListener('focusin', onFocusIn, true)
  }

  function deactivate() {
    if (!el) return
    const i = stack.lastIndexOf(el)
    if (i >= 0) stack.splice(i, 1)
    el = null
    document.removeEventListener('keydown', onKeydown, true)
    document.removeEventListener('focusin', onFocusIn, true)
    const back = opener
    opener = null
    if (!restoreFocus) return
    // After the dialog has left the page, and after anything that moves
    // focus on purpose (such as a command run from the dialog).
    setTimeout(() => {
      const now = document.activeElement
      if ((!now || now === document.body) && back?.isConnected) back.focus()
    })
  }

  // Synchronous, so the opener is recorded before the dialog focuses itself.
  watch(
    root,
    (node) => {
      if (node && node !== el) {
        deactivate()
        activate(node)
      } else if (!node) deactivate()
    },
    { flush: 'sync', immediate: true },
  )
  onBeforeUnmount(deactivate)
}
