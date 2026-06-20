import assert from 'node:assert/strict'
import { loadOmemoModule } from '../core/omemo-runtime-browser.js'

async function main() {
  // This only verifies the dynamic import resolves the package's Node-resolvable
  // entry point and exposes the expected shape — it does not prove the UMD bundle's
  // browser-only document-based path works, since this runs under Node. Real
  // browser-to-browser exercise of this loader happens in the Task 8 Playwright test.
  const omemo = await loadOmemoModule()
  assert.ok(omemo, 'loadOmemoModule() must resolve to the libomemo.js module')
  assert.ok(typeof (omemo as any).KeyHelper === 'object' || typeof (omemo as any).KeyHelper === 'function', 'module must expose KeyHelper')
  console.log('omemo-runtime-browser smoke test passed')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
