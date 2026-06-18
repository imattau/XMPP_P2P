import { getXmppUiRuntime } from '$lib/server/xmpp-runtime.js'

export async function load() {
  const runtime = await getXmppUiRuntime()
  return {
    snapshot: await runtime.snapshot()
  }
}
