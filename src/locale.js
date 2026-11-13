// The one locale Plumb formats numbers and dates in and sorts text by.
//
// Every Intl formatter and collator in the app comes from here, so the
// locale is decided in one place. Today it is the browser's own default,
// which is what the bare `toLocaleString()` calls this replaces used. When
// Plumb gets a language setting, it calls setLocale() and everything shown
// follows, because the locale is reactive.
import { ref } from 'vue'

const runtimeDefault = () => new Intl.DateTimeFormat().resolvedOptions().locale

const current = ref(runtimeDefault())

// The locale in use, e.g. "en-GB".
export const locale = () => current.value

// Use `tag` (a BCP 47 language tag), or the browser's default when empty.
// Returns the locale now in use. An invalid tag throws a RangeError.
export function setLocale(tag) {
  current.value = tag ? Intl.getCanonicalLocales(tag)[0] : runtimeDefault()
  return current.value
}

// Building an Intl object is slow next to using one, and lists format many
// values, so they're kept per locale and options.
const cache = new Map()
function cached(Ctor, options) {
  const key = `${Ctor.name}|${current.value}|${JSON.stringify(options)}`
  let made = cache.get(key)
  if (!made) cache.set(key, (made = new Ctor(current.value, options)))
  return made
}

// --- Numbers --------------------------------------------------------------------

// 1234 -> "1,234" (in English).
export const formatNumber = (n, options = {}) => cached(Intl.NumberFormat, options).format(n)

// Bytes as "12.3 MB" or "1.5 GB", with one decimal, never less than 0.1 MB.
export function formatBytes(bytes) {
  const [value, unit] = bytes >= 1e9 ? [bytes / 1e9, 'gigabyte'] : [Math.max(0.1, bytes / 1e6), 'megabyte']
  return formatNumber(value, { style: 'unit', unit, unitDisplay: 'short', minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

// --- Dates ----------------------------------------------------------------------

// What Date.prototype.toLocaleString() shows: the date and the time.
const DATE_TIME = { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }

export const formatDateTime = (t) => cached(Intl.DateTimeFormat, DATE_TIME).format(t)
export const formatDate = (t) => cached(Intl.DateTimeFormat, {}).format(t)

// How long ago (or until) a time: "now", "5 minutes ago", "yesterday".
export function formatRelative(t, now = Date.now()) {
  const rtf = cached(Intl.RelativeTimeFormat, { numeric: 'auto' })
  const s = Math.round((t - now) / 1000)
  for (const [unit, n] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), unit)
  }
  return rtf.format(0, 'second')
}

// ["a", "b", "c"] -> "a, b, and c" (in English).
export const formatList = (items, type = 'conjunction') => cached(Intl.ListFormat, { type }).format(items)

// --- Sorting --------------------------------------------------------------------

// A collator for the current locale, e.g. collator({ numeric: true }).
export const collator = (options = {}) => cached(Intl.Collator, options)

// Natural order, ignoring case and accents: "file2" before "File10".
export const compareNatural = (a, b) => collator({ numeric: true, sensitivity: 'base' }).compare(a, b)

// --- Text -----------------------------------------------------------------------

// Word or grapheme segmenter for the current locale, or null in a browser
// without Intl.Segmenter.
export const segmenter = (granularity) =>
  typeof Intl.Segmenter === 'function' ? cached(Intl.Segmenter, { granularity }) : null
