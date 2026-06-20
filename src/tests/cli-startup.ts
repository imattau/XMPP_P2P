import assert from 'node:assert/strict'
import { handleCliCommand } from '../cli/commands.js'
import { parseCliStartupArgs, printCliUsage } from '../cli/startup.js'
import { printCliHelp } from '../cli/output.js'

async function runCliStartupTest() {
  console.log('Starting CLI startup and help verification test...\n')

  const outputs: string[] = []
  const originalLog = console.log
  console.log = (...args: any[]) => {
    outputs.push(args.map(String).join(' '))
  }

  try {
    const parsed = parseCliStartupArgs([
      '--port=9001',
      '--host',
      '127.0.0.1'
    ])

    assert.equal(parsed.port, 9001)
    assert.equal(parsed.host, '127.0.0.1')
    assert.equal(parsed.helpRequested, false)
    assert.equal(parsed.versionRequested, false)
    assert.deepEqual(parsed.errors, [])

    const helpParsed = parseCliStartupArgs(['--help'])
    assert.equal(helpParsed.helpRequested, true)

    const versionParsed = parseCliStartupArgs(['--version'])
    assert.equal(versionParsed.versionRequested, true)

    const invalidParsed = parseCliStartupArgs(['--port=not-a-number'])
    assert.ok(invalidParsed.errors.some(line => line.includes('Invalid port value')))

    outputs.length = 0
    printCliUsage()
    assert.ok(outputs.some(line => line.includes('--help, -h')), 'startup usage should mention help')

    outputs.length = 0
    printCliHelp()
    assert.ok(outputs.some(line => line.includes('ping <peer-id/multiaddr>')), 'CLI help should list ping')
    assert.ok(outputs.some(line => line.includes('openpgp fetch <peer>')), 'CLI help should list openpgp fetch')

    const commandContext = {
      libp2p: {
        peerId: { toString: () => 'peer-test' },
        getMultiaddrs: () => [{ toString: () => '/ip4/127.0.0.1/tcp/9001/p2p/peer-test' }],
        addEventListener: () => undefined,
        getConnections: () => [],
        start: async () => undefined,
        stop: async () => undefined
      },
      xmppNode: {
        jid: 'atlas@p2p',
        publishCollection: async () => 'collection-item-1',
        unsubscribeCollection: async () => undefined,
        getCollectionSubscriptions: async () => [{ id: 'community1', topic: 'xmpp-collection:community1', subscribedAt: '2026-01-01T00:00:00.000Z' }],
        getPublicFeedSubscriptions: async () => [{ peerId: 'peer-test', jid: 'atlas@p2p', topic: 'xmpp-feed:peer-test', visibility: 'public', subscribedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
        watchFeedFollowers: async () => ({ peerId: 'peer-remote', topic: 'xmpp-followers:peer-remote', watchedAt: '2026-01-01T00:00:00.000Z' }),
        sendPresence: async () => undefined,
        getEntityCapabilities: async () => ({ peerId: 'peer-remote', jid: 'remote@p2p', node: 'urn:xmpp:p2p:discovery#node', ver: 'abc123', hash: 'sha-1', info: { node: 'urn:xmpp:p2p:discovery#node', identities: [], features: [], ver: 'abc123', hash: 'sha-1' }, discoveredAt: '2026-01-01T00:00:00.000Z' })
      },
      discoveredPeers: new Map(),
      rl: { close: () => undefined },
      showPrompt: () => undefined,
      resolvePeerTarget: (target: string) => target
    }

    outputs.length = 0
    await handleCliCommand('help feed', commandContext as any)
    assert.ok(outputs.some(line => line.includes('Commands for "feed"')), 'topic help should print a feed header')
    assert.ok(outputs.some(line => line.includes('feed post')), 'topic help should include feed commands')
    assert.ok(!outputs.some(line => line.includes('profile set')), 'topic help should not include unrelated commands')

    outputs.length = 0
    await handleCliCommand('help profile', commandContext as any)
    assert.ok(outputs.some(line => line.includes('Commands for "profile"')), 'topic help should print a profile header')
    assert.ok(outputs.some(line => line.includes('profile set')), 'profile help should include profile commands')
    assert.ok(!outputs.some(line => line.includes('feed post')), 'profile help should not include unrelated commands')

    outputs.length = 0
    await handleCliCommand('help feed post', commandContext as any)
    assert.ok(outputs.some(line => line.includes('Commands for "feed post"')), 'subcommand help should print a post header')
    assert.ok(outputs.some(line => line.includes('feed post <message>')), 'subcommand help should include the command synopsis')
    assert.ok(!outputs.some(line => line.includes('feed subscribe')), 'subcommand help should stay focused')

    outputs.length = 0
    await handleCliCommand('help profile set', commandContext as any)
    assert.ok(outputs.some(line => line.includes('Commands for "profile set"')), 'subcommand help should print a set header')
    assert.ok(outputs.some(line => line.includes('profile set [--fn')), 'subcommand help should include the profile set synopsis')
    assert.ok(!outputs.some(line => line.includes('profile [show]')), 'subcommand help should stay focused')

    outputs.length = 0
    await handleCliCommand('help feed banana', commandContext as any)
    assert.ok(outputs.some(line => line.includes('Unknown feed help topic: banana')), 'bad subtopics should be reported')
    assert.ok(outputs.some(line => line.includes('Commands for "feed"')), 'bad subtopics should fall back to the parent help group')

    outputs.length = 0
    await handleCliCommand('help openpgp fetch', commandContext as any)
    assert.ok(outputs.some(line => line.includes('Commands for "openpgp fetch"')), 'openpgp fetch help should be focused')
    assert.ok(outputs.some(line => line.includes('openpgp fetch <peer>')), 'openpgp fetch help should show the command synopsis')
    assert.ok(!outputs.some(line => line.includes('omemo fetch <peer>')), 'openpgp fetch help should not bleed omemo text')

    outputs.length = 0
    await handleCliCommand('collection post community1 Hello world', commandContext as any)
    assert.ok(outputs.some(line => line.includes('Published collection item: collection-item-1')), 'collection post should publish into a collection')

    outputs.length = 0
    await handleCliCommand('collection leave community1', commandContext as any)
    assert.ok(outputs.some(line => line.includes('Left!')), 'collection leave should confirm success')

    outputs.length = 0
    await handleCliCommand('collection subscriptions', commandContext as any)
    assert.ok(outputs.some(line => line.includes('Collection subscriptions (1):')), 'collection subscriptions should list current subscriptions')

    outputs.length = 0
    await handleCliCommand('feed public', commandContext as any)
    assert.ok(outputs.some(line => line.includes('Public feed subscriptions (1):')), 'feed public should list public subscriptions')

    outputs.length = 0
    await handleCliCommand('disco caps peer-remote', commandContext as any)
    assert.ok(outputs.some(line => line.includes('Peer ID: peer-remote')), 'disco caps should print the peer id')
    assert.ok(outputs.some(line => line.includes('Ver: abc123')), 'disco caps should print the capability ver')

    outputs.length = 0
    await handleCliCommand('feed watch-followers peer-remote', commandContext as any)
    assert.ok(outputs.some(line => line.includes('Watching follower updates for peer-remote...')), 'feed watch-followers should announce the watch')
    assert.ok(outputs.some(line => line.includes('Watching xmpp-followers:peer-remote for peer peer-remote since 2026-01-01T00:00:00.000Z')), 'feed watch-followers should print watch details')

    outputs.length = 0
    await handleCliCommand('presence send peer-remote subscribe --show chat --status "Checking in"', commandContext as any)
    assert.ok(outputs.some(line => line.includes('Sending presence subscribe to peer-remote [chat] (Checking in)...')), 'presence send should announce the direct stanza')
    assert.ok(outputs.some(line => line.includes('Presence sent!')), 'presence send should confirm success')

    originalLog('CLI startup and help verification results:')
    originalLog('  - startup option parsing handles port and host: SUCCESS')
    originalLog('  - help/version flags are recognized: SUCCESS')
    originalLog('  - startup usage mentions supported flags: SUCCESS')
    originalLog('  - CLI command help includes ping and OpenPGP commands: SUCCESS')
    originalLog('  - topic-specific help narrows output to relevant command groups: SUCCESS')
    originalLog('  - subcommand help narrows output to a single command synopsis: SUCCESS')
    originalLog('  - collection/feed/disco framework commands are wired into the CLI: SUCCESS')
    originalLog('  - feed follower watching is wired into the CLI: SUCCESS')
    originalLog('  - direct presence stanzas are wired into the CLI: SUCCESS')
    originalLog('\n>>> CLI STARTUP VERIFICATION SUCCESSFUL! <<<')
  } finally {
    console.log = originalLog
  }
}

runCliStartupTest().catch((err) => {
  console.error('CLI startup test error:', err)
  process.exit(1)
})
