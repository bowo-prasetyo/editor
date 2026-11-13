import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IDBFactory } from 'fake-indexeddb'
import { AUTO_INTERVAL, createHistory, hashText, versionsToDrop } from '../src/history.js'
import { indexedDBBackend, localStorageBackend, openIndexedDB } from '../src/backends.js'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

test('the hash tells texts apart', () => {
  assert.equal(hashText('abc'), hashText('abc'))
  assert.notEqual(hashText('abc'), hashText('abd'))
  assert.notEqual(hashText(''), hashText('\0'))
})

test('thinning: all recent, then hourly, then daily, nothing after 30 days', () => {
  const now = 100 * DAY
  const v = (id, ago, kind = 'auto', size = 10) => ({ id, at: now - ago, kind, size })
  const metas = [
    v(1, 5 * MIN), v(2, 10 * MIN), // last hour: both kept
    v(3, 2 * HOUR + 1 * MIN), v(4, 2 * HOUR + 20 * MIN), // same hour, 2h ago: keep the newer (3)
    v(5, 3 * DAY + HOUR), v(6, 3 * DAY + 2 * HOUR), // same day: keep the newer (5)
    v(7, 31 * DAY), // too old
    v(8, 40 * DAY, 'manual'), // marked: kept
  ]
  const drop = versionsToDrop(metas, now)
  assert.deepEqual(drop.sort(), [4, 6, 7])
})

test('limits: count and total size, oldest first, never the newest', () => {
  const now = DAY
  const metas = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, at: now - i * MIN, kind: 'manual', size: 100 }))
  assert.deepEqual(versionsToDrop(metas, now, { maxVersions: 4 }).sort(), [5, 6])
  assert.deepEqual(versionsToDrop(metas, now, { maxChars: 250 }).sort(), [3, 4, 5, 6])
  assert.deepEqual(versionsToDrop([{ id: 1, at: 0, kind: 'auto', size: 1e9 }], now, { maxChars: 10 }), [], 'one huge version stays')
})

for (const kind of ['indexedDB', 'localStorage']) {
  const makeBackend = async () =>
    kind === 'indexedDB' ? indexedDBBackend(await openIndexedDB(new IDBFactory()), null) : localStorageBackend({ length: 0, key: () => null, getItem: () => null, setItem() {}, removeItem() {} })

  test(`${kind}: automatic versions every few minutes while editing, skipping unchanged text`, async () => {
    let t = 1_000_000
    const h = createHistory(await makeBackend(), { now: () => t })
    const doc = { id: 'd', content: 'one', createdAt: t }
    assert.equal(await h.maybeRecord(doc), null, 'brand new document: not yet')
    t += AUTO_INTERVAL
    assert.ok(await h.maybeRecord(doc), 'five minutes on')
    doc.content = 'two'
    t += MIN
    assert.equal(await h.maybeRecord(doc), null, 'too soon after the last one')
    t += AUTO_INTERVAL
    assert.ok(await h.maybeRecord(doc))
    t += AUTO_INTERVAL
    assert.equal(await h.maybeRecord(doc), null, 'unchanged since the last version')
    const list = await h.list('d')
    assert.deepEqual(list.map((v) => [v.kind, v.size]), [['auto', 3], ['auto', 3]])
    assert.equal(await h.text(list[0].id), 'one')
    assert.equal(await h.text(list[1].id), 'two')
  })

  test(`${kind}: marked versions are kept even when unchanged, with labels`, async () => {
    const h = createHistory(await makeBackend())
    const doc = { id: 'd', content: 'same' }
    await h.record(doc, 'opened')
    await h.record(doc, 'manual', 'Sent to client')
    const list = await h.list('d')
    assert.deepEqual(list.map((v) => [v.kind, v.label]), [['opened', undefined], ['manual', 'Sent to client']])
  })
}

test('indexedDB: deleting a document deletes its versions', async () => {
  const b = indexedDBBackend(await openIndexedDB(new IDBFactory()), null)
  const h = createHistory(b)
  await b.put({ id: 'd', name: 'a', content: 'x' })
  await h.record({ id: 'd', content: 'x' }, 'manual')
  await h.record({ id: 'e', content: 'y' }, 'manual')
  await b.remove('d')
  assert.deepEqual(await h.list('d'), [])
  assert.equal((await h.list('e')).length, 1, 'other documents keep theirs')
})
