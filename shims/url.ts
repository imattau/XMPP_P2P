export function fileURLToPath(url: string): string {
  if (url.startsWith('file://')) {
    return url.slice(7)
  }
  return url
}
