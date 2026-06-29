export async function resolveSrv(_name: string): Promise<Array<{ name: string; port: number; priority: number; weight: number }>> {
  throw new Error('resolveSrv not available in browser')
}
