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
 * @returns The browser OMEMO module.
 */
async function loadOmemoModule(): Promise<OmemoModule> {
  if (!omemoModulePromise) {
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
