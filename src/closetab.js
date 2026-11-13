// Closing a tab, from the tab bar or the command palette.
import { getDoc } from './store.js'
import { closeTab } from './session.js'
import { displayName } from './naming.js'
import { showToast } from './toast.js'
import { t } from './i18n.js'

// Close the tab for document `id`. If it was the one on screen (`active`),
// show its neighbour, or the document list. A file with changes not saved
// to it keeps them (in the browser, as always), and says so: in other
// editors, closing a tab with unsaved changes asks or throws them away.
export function closeDocTab(router, id, active) {
  const doc = getDoc(id)
  const next = closeTab(id)
  if (doc?.linked && doc.diskDirty) {
    showToast(t('tabs.closedUnsaved', { name: displayName(doc.name) }), {
      action: { label: t('tabs.reopen'), run: () => router.push({ name: 'edit', params: { id } }) },
      timeout: 8000,
    })
  }
  if (id !== active) return
  router.push(next ? { name: 'edit', params: { id: next } } : { name: 'home' })
}
