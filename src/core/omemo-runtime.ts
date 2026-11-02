/**
 * @packageDocumentation Node-side OMEMO runtime loader and libomemo.js compatibility
 * shim used by the secure messaging layer.
 */

import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { createHash } from 'crypto'
import { tmpdir } from 'os'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import type {
  Direction as OmemoDirection,
  KeyPair as OmemoKeyPair,
  OMEMOAddress as OmemoAddress,
  SessionBuilder as OmemoSessionBuilder,
  SessionCipher as OmemoSessionCipher
} from 'libomemo.js'

/**
 * Dynamically loaded OMEMO module surface.
 */
export type OmemoModule = typeof import('libomemo.js')

let omemoModulePromise: Promise<OmemoModule> | undefined
let omemoFetchShimInstalled = false

/**
 * Installs a small fetch shim so libomemo.js can resolve local WASM assets.
 *
 * @param distDir - Directory containing the libomemo.js distribution files.
 * @returns Nothing.
 */
function installOmemoFetchShim(distDir: string) {
  if (omemoFetchShimInstalled) {
    return
  }

  const originalFetch: typeof globalThis.fetch | undefined = globalThis.fetch
    ? globalThis.fetch.bind(globalThis)
    : undefined

  const shimFetch: typeof globalThis.fetch = async (input, init) => {
    const target = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)

    let filePath: string | undefined
    if (target.startsWith('file:')) {
      filePath = fileURLToPath(target)
    } else if (target.startsWith('/')) {
      filePath = target
    } else if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(target)) {
      filePath = join(distDir, target)
    }

    if (filePath) {
      const body = await fs.readFile(filePath)
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/wasm',
          'content-length': String(body.byteLength)
        }
      })
    }

    if (originalFetch) {
      return originalFetch(input, init)
    }
    throw new Error(`fetch is not available and shim cannot handle: ${target}`)
  }

  ;(globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch = shimFetch
  omemoFetchShimInstalled = true
}

/**
 * Loads the libomemo.js runtime, patching the packaged UMD build if needed.
 *
 * @returns The loaded OMEMO module.
 */
async function loadOmemoModule(): Promise<OmemoModule> {
  if (!omemoModulePromise) {
    const distDir = fileURLToPath(new URL('../../node_modules/libomemo.js/dist/', import.meta.url))
    const requireShim = createRequire(import.meta.url)
    // Assign synchronously before any await so concurrent callers
    // see the pending promise and don't race on file patching.
    omemoModulePromise = (async (): Promise<OmemoModule> => {
      try {
        const sourcePath = join(distDir, 'libomemo.umd.js')
        const source = await fs.readFile(sourcePath, 'utf8')
        installOmemoFetchShim(distDir)
        // Tell libomemo.js where its WASM binary lives. Without this the UMD
        // glue resolves a bare `curve25519_compiled.wasm` against the process
        // CWD, which fails in Electron's main process.
        ;(globalThis as typeof globalThis & { __WASM_BASE__?: string }).__WASM_BASE__ =
          distDir.endsWith('/') || distDir.endsWith('\\') ? distDir : `${distDir}/`

        // The patched UMD is written to the OS temp directory rather than
        // node_modules: inside an Electron asar archive, node_modules is
        // read-only.
        const sourceHash = createHash('sha256').update(source).digest('hex').slice(0, 16)
        const patchedPath = join(tmpdir(), 'xmpp-p2p-libomemo', `libomemo-${sourceHash}.cjs`)
        const patchedExists = await fs.stat(patchedPath).then(() => true).catch(() => false)
        if (!patchedExists) {
          const patchedSource = source.replace(
            "var _scriptDir = (typeof document === 'undefined' && typeof location === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : typeof document === 'undefined' ? location.href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('libomemo.umd.js', document.baseURI).href));",
            "var _scriptDir = require('path').dirname(__filename) + '/';"
          )
          await fs.mkdir(dirname(patchedPath), { recursive: true })
          await fs.writeFile(patchedPath, patchedSource, 'utf8')
        }
        return requireShim(patchedPath) as OmemoModule
      } catch (err) {
        omemoModulePromise = undefined
        console.error('[OMEMO] Failed to load OMEMO module, will retry on next call:', err)
        throw err
      }
    })()
  }

  return await omemoModulePromise
}

export type {
  OmemoDirection,
  OmemoKeyPair,
  OmemoAddress,
  OmemoSessionBuilder,
  OmemoSessionCipher
}

export { loadOmemoModule }
