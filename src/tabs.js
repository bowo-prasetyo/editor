// Open tabs and recently opened documents: plain lists of document ids,
// kept in preferences. Pure helpers, so they're easy to test.

export const MAX_TABS = 20
export const MAX_RECENT = 50

// Add a tab for `id` (if not already open), right after `after` when given,
// else at the end. Oldest tabs beyond `max` are dropped, never `id` itself.
export function withTab(tabs, id, after = null, max = MAX_TABS) {
  if (tabs.includes(id)) return tabs
  const i = after ? tabs.indexOf(after) : -1
  const next = i === -1 ? [...tabs, id] : [...tabs.slice(0, i + 1), id, ...tabs.slice(i + 1)]
  while (next.length > max) next.splice(next[0] === id ? 1 : 0, 1)
  return next
}

export const withoutTab = (tabs, id) => tabs.filter((t) => t !== id)

// The tab to show after closing `id`: the one to its right, else its left.
export function neighborTab(tabs, id) {
  const i = tabs.indexOf(id)
  if (i === -1) return null
  return tabs[i + 1] ?? tabs[i - 1] ?? null
}

// The tab `step` places away from `id`, wrapping around.
export function cycleTab(tabs, id, step) {
  if (!tabs.length) return null
  const i = tabs.indexOf(id)
  return tabs[(((i === -1 ? 0 : i) + step) % tabs.length + tabs.length) % tabs.length]
}

// Most recently opened first.
export function touched(recent, id, max = MAX_RECENT) {
  return [id, ...recent.filter((r) => r !== id)].slice(0, max)
}
