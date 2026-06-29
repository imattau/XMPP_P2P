export const join = (...args: string[]) => args.join('/')
export const dirname = (p: string) => {
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.substring(0, i) : '.'
}
export const basename = (p: string) => {
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.substring(i + 1) : p
}
export const extname = (p: string) => {
  const i = p.lastIndexOf('.')
  return i >= 0 ? p.substring(i) : ''
}
export const resolve = (...args: string[]) => args.join('/')
