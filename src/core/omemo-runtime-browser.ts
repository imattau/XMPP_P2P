/**
 * @packageDocumentation Browser-targeted libomemo.js loader. The Node loader in
 * omemo-runtime.ts exists only to work around Node having no `document` global
 * (which libomemo.js's UMD bundle uses to resolve its own script/WASM location);
 * in a real browser that branch already works, so this is a plain dynamic import.
 */

import type {
  Direction as OmemoDirection,
  KeyPair as OmemoKeyPair,
  OMEMOAddress as OmemoAddress,
  SessionBuilder as OmemoSessionBuilder,
  SessionCipher as OmemoSessionCipher
} from 'libomemo.js'

export type OmemoModule = typeof import('libomemo.js')

let omemoModulePromise: Promise<OmemoModule> | undefined

/**
 * Loads the browser build of libomemo.js once and reuses it for later callers.
 *
 * libomemo.js ships a Curve25519 WASM module that resolves the .wasm path
 * relative to the page URL when document.currentScript is unavailable (e.g.
 * after a dynamic import).  Setting __WASM_BASE__ tells the Emscripten glue
 * where to find the binary so it doesn't 404 on deep-linked routes like
 * /onboarding/ready.
 */
async function loadOmemoModule(): Promise<OmemoModule> {
  if (!omemoModulePromise) {
    ;(self as any).__WASM_BASE__ = '/'
    omemoModulePromise = import('libomemo.js')
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
