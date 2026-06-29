import * as esbuild from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const nodeShims = {
  crypto: 'shims/crypto.ts',
  'node:crypto': 'shims/crypto.ts',
  events: 'shims/events.ts',
  fs: 'shims/fs.ts',
  'fs/promises': 'shims/fs.ts',
  http: 'shims/http.ts',
  https: 'shims/https.ts',
  net: 'shims/net.ts',
  tls: 'shims/tls.ts',
  dns: 'shims/dns.ts',
  'node:dns': 'shims/dns.ts',
  'dns/promises': 'shims/dns-promises.ts',
  'node:dns/promises': 'shims/dns-promises.ts',
  os: 'shims/os.ts',
  path: 'shims/path.ts',
  module: 'shims/module.ts',
  url: 'shims/url.ts',
  stream: 'shims/stream.ts',
  util: 'shims/util.ts',
  assert: 'shims/assert.ts',
  zlib: 'shims/zlib.ts',
  querystring: 'shims/querystring.ts',
  string_decoder: 'shims/string-decoder.ts',
}

const externalModules = [
  '@xmpp/component',
  '@xmpp/component-core',
  '@xmpp/connection-tcp',
]

const shimPlugin = {
  name: 'node-shims',
  setup(build) {
    for (const [mod, shimPath] of Object.entries(nodeShims)) {
      build.onResolve({ filter: new RegExp(`^${mod.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')}$`) }, () => ({
        path: path.resolve(__dirname, shimPath)
      }))
    }
    for (const mod of externalModules) {
      build.onResolve({ filter: new RegExp(`^${mod.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')}$`) }, () => ({
        path: mod,
        external: true
      }))
    }
    build.onResolve({ filter: /^node:/ }, (args) => {
      const nodeMod = args.path.slice(5)
      const shim = nodeShims[nodeMod] || nodeShims[`node:${nodeMod}`]
      if (shim) {
        return { path: path.resolve(__dirname, shim) }
      }
      return { path: args.path, external: true }
    })
  }
}

await esbuild.build({
  entryPoints: ['src/browser-index.ts'],
  bundle: true,
  outfile: 'dist/browser/bundle.js',
  format: 'iife',
  globalName: 'XmppP2P',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  plugins: [shimPlugin],
  logOverride: {
    'empty-import-meta': 'silent'
  },
  define: {
    'process.env.XMPP_UPLOAD_HOST': '"127.0.0.1"',
    'process.env.XMPP_UPLOAD_PORT': '"0"',
    'process.env.XMPP_SQLITE_PATH': 'undefined',
    global: 'globalThis'
  },
  inject: [path.resolve(__dirname, 'shims/globals.ts')]
})
