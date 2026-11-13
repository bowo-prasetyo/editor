// The one locale numbers and dates are shown in and text is sorted by (src/locale.js).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  collator,
  compareNatural,
  formatBytes,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  locale,
  setLocale,
} from '../src/locale.js'

const T = Date.UTC(2026, 0, 2, 3, 4, 5)

test('by default, the browser’s own locale: the same as a bare toLocaleString()', () => {
  setLocale('')
  assert.equal(locale(), new Intl.DateTimeFormat().resolvedOptions().locale)
  assert.equal(formatDateTime(T), new Date(T).toLocaleString())
  assert.equal(formatDate(T), new Date(T).toLocaleDateString())
  assert.equal(formatNumber(1234567), (1234567).toLocaleString())
})

test('everything follows setLocale()', () => {
  try {
    assert.equal(setLocale('en-us'), 'en-US', 'tags are canonicalised')
    assert.equal(formatNumber(1234.5), '1,234.5')
    assert.equal(formatBytes(1_234_567), '1.2 MB')
    assert.equal(formatBytes(2.5e9), '2.5 GB')
    assert.equal(formatBytes(10), '0.1 MB', 'never less than 0.1 MB')
    setLocale('de-DE')
    assert.equal(formatNumber(1234.5), '1.234,5')
    assert.equal(formatBytes(1_234_567), '1,2 MB')
    assert.equal(formatRelative(T - 86_400_000, T), 'gestern')
    assert.throws(() => setLocale('not a tag!'), RangeError)
  } finally {
    setLocale('')
  }
})

test('relative times: now, minutes, hours, days', () => {
  try {
    setLocale('en')
    assert.equal(formatRelative(T - 5_000, T), 'now')
    assert.equal(formatRelative(T - 3 * 60_000, T), '3 minutes ago')
    assert.equal(formatRelative(T - 2 * 3_600_000, T), '2 hours ago')
    assert.equal(formatRelative(T - 86_400_000, T), 'yesterday')
  } finally {
    setLocale('')
  }
})

test('sorting is natural and follows the locale', () => {
  try {
    setLocale('en')
    assert.deepEqual(['file10', 'File2', 'file1'].sort(compareNatural), ['file1', 'File2', 'file10'])
    setLocale('sv')
    // In Swedish, "ä" sorts after "z"; in German, next to "a".
    assert.deepEqual(['ä', 'z', 'a'].sort(collator().compare), ['a', 'z', 'ä'])
    setLocale('de')
    assert.deepEqual(['ä', 'z', 'a'].sort(collator().compare), ['a', 'ä', 'z'])
  } finally {
    setLocale('')
  }
})
