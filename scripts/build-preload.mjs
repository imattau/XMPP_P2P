import * as esbuild from 'esbuild'

// Sandboxed Electron preloads must be CommonJS. The main process stays ESM.
await esbuild.build({
  entryPoints: ['src/electron/preload.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: 'dist/electron/preload.cjs',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info'
})
