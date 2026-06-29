export const createRequire = () => {
  return (id: string) => { throw new Error(`require(${id}) not available in browser`) }
}
