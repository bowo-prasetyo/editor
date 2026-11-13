import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { FakeFile } from './fakefs.js'
import { cacheSize, dropPrefix, isBinaryName, isCached, markChanged, readText, setCacheLimit } from '../src/filecache.js'

// A file that counts how often it's read.
class CountingFile extends FakeFile {
  constructor(name, text) {
    super(name, text)
    this.reads = 0
    this.stats = 0
  }
  async getFile() {
    this.stats++
    const f = await super.getFile()
    const self = this
    return Object.assign(f, { arrayBuffer: async () => (self.reads++, self.bytes.buffer.slice(0)) })
  }
}

beforeEach(() => {
  dropPrefix('')
  setCacheLimit()
})

test('binary files are known by name and never read', async () => {
  assert.equal(isBinaryName('logo.PNG'), true)
  assert.equal(isBinaryName('font.woff2'), true)
  assert.equal(isBinaryName('main.js'), false)
  assert.equal(isBinaryName('.png'), false) // a dotfile, not an extension
  const f = new CountingFile('a.png', 'x')
  assert.deepEqual(await readText('r:a.png', f), { skip: 'binary' })
  assert.equal(f.stats, 0)
})

test('text is read once; afterwards only the size and date are checked', async () => {
  const f = new CountingFile('a.txt', 'hello')
  assert.deepEqual(await readText('r:a.txt', f), { text: 'hello' })
  assert.deepEqual(await readText('r:a.txt', f), { text: 'hello' })
  assert.equal(f.reads, 1)
  assert.equal(f.stats, 2)
  f.write('changed')
  assert.deepEqual(await readText('r:a.txt', f), { text: 'changed' })
  assert.equal(f.reads, 2)
})

test('while the folder is watched, cached text is used without looking at the file', async () => {
  const f = new CountingFile('a.txt', 'hello')
  let t = 1000
  const now = () => t
  await readText('r:a.txt', f, { trustSince: 500, now })
  t = 2000
  assert.deepEqual(await readText('r:a.txt', f, { trustSince: 500, now }), { text: 'hello' })
  assert.equal(f.stats, 1, 'not even its date')
  // Read before the watching started: checked once.
  assert.deepEqual(await readText('r:a.txt', f, { trustSince: 1500, now }), { text: 'hello' })
  assert.equal(f.stats, 2)
})

test('a reported change drops the text, and an entry read before the report is not trusted', async () => {
  const f = new CountingFile('a.txt', 'v1')
  let t = 1000
  const now = () => t
  await readText('r:a.txt', f, { trustSince: 0, now })
  f.write('v2')
  markChanged('r:a.txt', 1500)
  assert.equal(isCached('r:a.txt'), false)
  t = 2000
  assert.deepEqual(await readText('r:a.txt', f, { trustSince: 0, now }), { text: 'v2' })
  // A read that started before a change was reported isn't trusted later.
  t = 3000
  await readText('r:b.txt', new CountingFile('b.txt', 'old'), { trustSince: 0, now })
  const b = new CountingFile('b.txt', 'new')
  markChanged('r:b.txt', 3000)
  await readText('r:b.txt', b, { trustSince: 0, now }) // read at 3000, same moment as the report
  t = 4000
  await readText('r:b.txt', b, { trustSince: 0, now })
  assert.equal(b.stats, 2, 'checked again rather than trusted')
})

test('big files are skipped and remembered; gone files are reported', async () => {
  const big = new CountingFile('big.txt', 'x'.repeat(2_000_001))
  assert.deepEqual(await readText('r:big.txt', big), { skip: 'big' })
  assert.deepEqual(await readText('r:big.txt', big), { skip: 'big' })
  assert.equal(big.reads, 0)
  const gone = { name: 'g.txt', getFile: async () => { throw new Error('gone') } }
  assert.deepEqual(await readText('r:g.txt', gone), { skip: 'gone' })
  const bin = new CountingFile('data', new Uint8Array([0, 1, 2, 0, 0, 3]))
  assert.deepEqual(await readText('r:data', bin), { skip: 'binary' })
})

test('the least recently used files go when the cache is full', async () => {
  setCacheLimit(10)
  const a = new CountingFile('a.txt', 'aaaa')
  const b = new CountingFile('b.txt', 'bbbb')
  const c = new CountingFile('c.txt', 'cccc')
  await readText('r:a.txt', a)
  await readText('r:b.txt', b)
  await readText('r:a.txt', a) // a is now the most recently used
  await readText('r:c.txt', c)
  assert.equal(isCached('r:a.txt'), true)
  assert.equal(isCached('r:b.txt'), false)
  assert.equal(cacheSize().chars, 8)
  dropPrefix('r:')
  assert.deepEqual(cacheSize(), { files: 0, chars: 0 })
})
