// Stand-ins for the File System Access API's handles, backed by memory.
// (A helper for tests, not a test itself.)
export class FakeFile {
  constructor(name, text = '') {
    this.kind = 'file'
    this.name = name
    this.write(text)
  }
  write(text) {
    this.bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text
    this.lastModified = (this.lastModified ?? 1000) + 1
  }
  async getFile() {
    if (this.missing) throw Object.assign(new Error('gone'), { name: 'NotFoundError' })
    return new File([this.bytes], this.name, { lastModified: this.lastModified })
  }
  async createWritable() {
    const chunks = []
    return {
      write: async (blob) => chunks.push(new Uint8Array(await blob.arrayBuffer())),
      close: async () => this.write(chunks[0]),
      abort: async () => {},
    }
  }
  async queryPermission() { return 'granted' }
  async isSameEntry(other) { return other === this }
  text() { return new TextDecoder().decode(this.bytes) }
}

const notFound = () => Object.assign(new Error('not found'), { name: 'NotFoundError' })
const mismatch = () => Object.assign(new Error('wrong kind'), { name: 'TypeMismatchError' })

export class FakeDir {
  constructor(name, children = {}) {
    this.kind = 'directory'
    this.name = name
    this.children = new Map()
    for (const [n, c] of Object.entries(children)) {
      this.children.set(n, typeof c === 'string' || c instanceof Uint8Array ? new FakeFile(n, c) : new FakeDir(n, c))
    }
    this.permission = 'granted'
  }
  async *values() { yield* this.children.values() }
  async getFileHandle(name, { create = false } = {}) {
    const c = this.children.get(name)
    if (c?.kind === 'file') return c
    if (c) throw mismatch()
    if (!create) throw notFound()
    const f = new FakeFile(name)
    this.children.set(name, f)
    return f
  }
  async getDirectoryHandle(name, { create = false } = {}) {
    const c = this.children.get(name)
    if (c?.kind === 'directory') return c
    if (c) throw mismatch()
    if (!create) throw notFound()
    const d = new FakeDir(name)
    this.children.set(name, d)
    return d
  }
  async queryPermission() { return this.permission }
  async requestPermission() { return (this.permission = 'granted') }
  async isSameEntry(other) { return other === this }
}

