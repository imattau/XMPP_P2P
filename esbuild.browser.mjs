import * as esbuild from 'esbuild'

const nodeBuiltIns = [
  'crypto', 'http', 'https', 'fs', 'path', 'module', 'url',
  'events', 'stream', 'buffer', 'util', 'assert', 'string_decoder',
  'dgram', 'os', 'tls', 'net', 'child_process', 'zlib', 'querystring',
  'punycode', 'readline', 'timers', 'tty', 'constants', 'domain',
  'dns/promises'
]

const nodeBuiltInPlugin = {
  name: 'node-builtins',
  setup(build) {
    build.onResolve({ filter: /^node:/ }, (args) => ({
      path: args.path,
      external: true
    }))
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
  external: nodeBuiltIns,
  plugins: [nodeBuiltInPlugin],
  logOverride: {
    'empty-import-meta': 'silent'
  },
  define: {
    'process.env.XMPP_UPLOAD_HOST': '"127.0.0.1"',
    'process.env.XMPP_UPLOAD_PORT': '"0"',
    'process.env.XMPP_SQLITE_PATH': 'undefined',
    global: 'globalThis'
  }
})
