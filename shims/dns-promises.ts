export async function resolveSrv(_name: string): Promise<Array<{ name: string; port: number; priority: number; weight: number }>> {
  throw new Error('resolveSrv not available in browser')
}

export function lookup(
  _hostname: string,
  optionsOrCallback: unknown,
  callback?: (...args: any[]) => void
): void {
  const done = typeof optionsOrCallback === 'function'
    ? optionsOrCallback as (...args: any[]) => void
    : callback
  const error = Object.assign(new Error('DNS lookup is not available in browser transports'), { code: 'ENOTFOUND' })
  queueMicrotask(() => done?.(error))
}

export default { lookup, resolveSrv }
