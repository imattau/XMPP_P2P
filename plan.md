# Plan: XMPP over libp2p Prototype (TypeScript)

## Objective
Establish an extensible prototype of XMPP messaging running over a peer-to-peer transport using TypeScript, `@libp2p` components, and `@xmpp/xml`.

## Strategy
We will use TypeScript and Node.js.
- **P2P Transport**: Use `@libp2p` packages to configure a peer-to-peer node supporting TCP, Noise encryption, Yamux multiplexing, and mDNS discovery.
- **XMPP Parsing**: Use `@xmpp/xml` to incrementally parse XML stanzas from the libp2p stream.
- **Protocol**: Define a custom protocol handler `/xmpp/1.0.0` in libp2p. When peers connect, they exchange XML stanzas (e.g., `<message>`, `<presence>`) over a duplex stream.

## Tasks

### 1. Research & Initialization
- [x] Task 1.1: Initialize Node.js package, configure `tsconfig.json`, and install dependencies (`libp2p`, `@libp2p/interface`, `@libp2p/tcp`, `@libp2p/noise`, `@libp2p/yamux`, `@libp2p/mdns`, `@xmpp/xml`, `typescript`, `ts-node`).
- [x] Task 1.2: Security mapping: Define identity and transport verification parameters between libp2p Peer IDs and XMPP Jabber IDs (JIDs). JIDs are mapped as `<peer-id>@p2p`. Transport is secured by libp2p Noise protocol.

### 2. Implementation
- [x] Task 2.1: Implement the P2P Node creator (`src/p2p.ts`) to configure and launch a libp2p node with Yamux, Noise, and mDNS.
- [x] Task 2.2: Implement the XMPP Stream parser and handler (`src/xmpp-stream.ts`) that hooks a libp2p Stream to the `@xmpp/xml` parser.
- [x] Task 2.3: Implement the P2P XMPP Node wrapper (`src/xmpp-node.ts`) to manage registration of the `/xmpp/1.0.0` protocol handler, state, and outgoing stanza dispatching.
- [x] Task 2.4: Implement command-line interface (`src/index.ts`) for starting a node, discovering peers, and sending/receiving interactive chat messages.

### 3. Verification & Hardening
- [x] Task 3.1: Write validation script/tests to verify two nodes running locally can discover each other and open streams.
- [x] Task 3.2: Verify standard-compliant XMPP stanzas are successfully parsed and routed.
- [x] Task 3.3: Perform security validation to ensure traffic is encrypted by Noise and no raw XML injection vulnerabilities exist in parsing. Passed (secured by Noise; XML escaping is enforced by @xmpp/xml).

### 4. PubSub Extension
- [ ] Task 4.1: Configure Gossipsub in `src/p2p.ts`.
- [ ] Task 4.2: Implement PubSub publishing and subscribing with XEP-0060 compliant stanzas in `src/xmpp-node.ts`.
- [ ] Task 4.3: Expose PubSub commands (`subscribe`, `publish`) in the CLI `src/index.ts` and verify.
