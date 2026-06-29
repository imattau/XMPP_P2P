export function ok(val: any, msg?: string) {
  if (!val) throw new Error(msg || 'Assertion failed')
}
export function equal(actual: any, expected: any, msg?: string) {
  if (actual != expected) throw new Error(msg || `Expected ${expected}, got ${actual}`)
}
export function strictEqual(actual: any, expected: any, msg?: string) {
  if (actual !== expected) throw new Error(msg || `Expected ${expected}, got ${actual}`)
}
export function deepEqual(actual: any, expected: any, msg?: string) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`)
}
export const fail = (msg?: string) => { throw new Error(msg || 'Failed') }
export default { ok, equal, strictEqual, deepEqual, fail }
