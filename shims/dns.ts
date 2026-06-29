const dns = {
  lookup(hostname: string, options: any, callback: (err: Error | null, address?: string, family?: number) => void): void {
    if (typeof options === 'function') {
      callback = options
      options = {}
    }
    setTimeout(() => callback(new Error('dns.lookup not available in browser')), 0)
  },
  resolveSrv(name: string, callback: (err: Error | null, records?: Array<{ name: string; port: number; priority: number; weight: number }>) => void): void {
    setTimeout(() => callback(new Error('dns.resolveSrv not available in browser')), 0)
  }
}

export default dns
