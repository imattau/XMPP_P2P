export function stringify(obj: Record<string, any>): string {
  return Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
}
export function parse(str: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const part of str.split('&')) {
    const [k, v] = part.split('=')
    result[decodeURIComponent(k)] = decodeURIComponent(v || '')
  }
  return result
}
