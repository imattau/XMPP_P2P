export const inherits = (ctor: any, superCtor: any) => {
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: { value: ctor, writable: true, configurable: true }
  })
}
export const deprecate = (fn: any) => fn
export const format = (fmt: string, ...args: any[]) => fmt
export const types = {
  isArrayBuffer: (v: any) => v instanceof ArrayBuffer,
  isUint8Array: (v: any) => v instanceof Uint8Array,
  isArray: (v: any) => Array.isArray(v),
}
