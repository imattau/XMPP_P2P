/**
 * @packageDocumentation Node-side OMEMO runtime loader and libomemo.js compatibility
 * shim used by the secure messaging layer.
 */

import { promises as fs } from 'fs'
import { join, dirname } from 'path'
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
  if (omemoFetchShimInstalled || !globalThis.fetch) {
    return
  }

  const originalFetch = globalThis.fetch.bind(globalThis)
  ;(globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
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

    return await originalFetch(input, init)
  }

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
    const sourcePath = join(distDir, 'libomemo.umd.js')
    const patchedPath = join(distDir, 'libomemo.node.cjs')
    const source = await fs.readFile(sourcePath, 'utf8')
    const requireShim = createRequire(import.meta.url)
    installOmemoFetchShim(distDir)
    if (!(await fs.stat(patchedPath).catch(() => null))) {
      const patchedSource = source.replace(
        "var _scriptDir = (typeof document === 'undefined' && typeof location === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : typeof document === 'undefined' ? location.href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('libomemo.umd.js', document.baseURI).href));",
        "var _scriptDir = require('path').dirname(__filename) + '/';"
      )
      await fs.writeFile(patchedPath, patchedSource, 'utf8')
    }
    omemoModulePromise = Promise.resolve(requireShim(patchedPath) as OmemoModule)
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
