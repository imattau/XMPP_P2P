export function createHash(_algorithm: string): { update(data: string | Uint8Array): typeof hash; digest(encoding?: string): string } {
  const hash = { update: () => hash, digest: () => '' }
  return hash
}

export function randomBytes(size: number): Uint8Array {
  const buf = new Uint8Array(size)
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    globalThis.crypto.getRandomValues(buf)
  }
  return buf
}

export function createCipheriv(_algorithm: string, _key: Uint8Array, _iv: Uint8Array) {
  return {
    update: (data: string) => Buffer.from(data),
    final: () => Buffer.from(''),
    getAuthTag: () => Buffer.from('')
  }
}

export function createDecipheriv(_algorithm: string, _key: Uint8Array, _iv: Uint8Array) {
  return {
    update: (data: string) => Buffer.from(data),
    final: () => Buffer.from(''),
    setAuthTag: (_tag: Uint8Array) => {}
  }
}
