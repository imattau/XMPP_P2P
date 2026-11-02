# XMPP P2P (XMPP over libp2p)

A decentralized, serverless implementation of the Extensible Messaging and Presence Protocol (XMPP) running over a peer-to-peer overlay network powered by libp2p.

## Project Overview

Traditionally, XMPP relies on a federated client-server architecture where clients connect to home servers (e.g., ejabberd, Prosody), and servers federate with each other. 

**XMPP P2P** reimagines XMPP by removing the server requirement entirely. Instead:
- Nodes run as peers in a peer-to-peer network (`libp2p`).
- Standard XMPP XML stanzas (messages, presence, IQ) are adapted and routed directly between peers via libp2p streams and Gossipsub pubsub topics.
- Network discovery, roster search, offline mailboxes, and group settings are handled via a Kademlia Distributed Hash Table (DHT).

This allows for completely decentralized, censorship-resistant, serverless instant messaging, group chat, and social feeds.

---

## Features

This project implements a wide range of XMPP Core RFCs and XEPs (XMPP Extension Protocols) adapted for P2P:

- **Core P2P Routing**: Multi-transport support (TCP, WebSockets), Noise-encrypted connection security, Yamux stream multiplexing, and mDNS local network discovery.
- **Roster & Presence (RFC 6121 / XEP-0144)**: Manage roster entries, request presence subscriptions, and broadcast presence states (online, show, status).
- **Messaging & Chat States (XEP-0085 / XEP-0308)**: Direct instant messages with support for delivery receipts (XEP-0184), message correction (XEP-0308), and typing notifications/chat states.
- **OMEMO E2EE (XEP-0384)**: End-to-end encryption using the double ratchet algorithm (via `libomemo.js`) for both one-to-one and multi-user chat sessions.
- **OpenPGP for XMPP (XEP-0373 / XEP-0374)**: Alternative public-key encryption support.
- **Decentralized Multi-User Chat (MUC) (XEP-0045)**: Serverless chat rooms where states, rosters, and messages are synchronized via Gossipsub and stored in the DHT for joining peers.
- **Publish-Subscribe (XEP-0060)**: Decentralized publish-subscribe nodes with support for attachments (reactions, notices) and encrypted payloads.
- **Microblogging & Feeds (XEP-0277 / XEP-0248)**: Local feed post publishing, public/private followers, and collection nodes (aggregated community channels).
- **DHT Mailbox & Persistence**: Kademlia DHT-backed offline mailboxes for buffering stanzas when a peer is offline, and local JSON file persistence for user history, rosters, key material, and feed state.

---

## Setup & Building

### Prerequisites

- **Node.js** (v22 or higher required)
- **npm** (v9 or higher)

### Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/imattau/XMPP_P2P.git
cd XMPP_P2P
npm install
```

### Building the Project

Compile TypeScript source code to the `dist/` directory:

```bash
npm run build
```

### Cross-platform builds

The same `ui/dist` bundle ships as a PWA, an Electron desktop app and an
Android app (via Capacitor).

**Web / PWA**

```bash
npm run build:web          # esbuild browser bundle + Vite build -> ui/dist
npm run ui:preview         # serve the production build locally
```

**Desktop (Electron)**

```bash
npm run electron:dev       # build the web UI + Electron main/preload, then launch
npm run dist:desktop       # unsigned installers in release/
```

Release artifacts:

- **Linux**: AppImage, `.deb` (apt), `.rpm`, `.flatpak` (runtime `org.freedesktop.Platform//25.08`)
- **Windows**: NSIS installer and portable `.exe`
- **macOS**: `.dmg` and `.zip` (x64 + arm64)

Linux install examples:

```bash
sudo apt install ./Nexus-*.deb
sudo dnf install ./Nexus-*.rpm
flatpak install --user ./Nexus-*.flatpak
```

Desktop builds are intentionally **unsigned**. macOS will show Gatekeeper's
"unidentified developer" prompt (right-click → Open, or
`xattr -dr com.apple.quarantine /Applications/Nexus.app`); Windows shows
SmartScreen ("More info" → "Run anyway").

The desktop app runs a native libp2p node (TCP, mDNS, DHT) and SQLite storage
in the Electron main process. The renderer is loaded from
`http://127.0.0.1:43117` so `crypto.subtle` works, and talks to the node over
a context-isolated preload bridge.

**Android (Capacitor + ZapStore)**

```bash
npm run android:sync       # build the web UI and copy it into android/
npm run dist:android       # local signed release build (requires a keystore)
```

Android releases are built and signed in CI and published to
[ZapStore](https://zapstore.dev/) from `.github/workflows/release.yml`.
The signing secrets are the same ones used by
[imattau/Mangatsu](https://github.com/imattau/Mangatsu/settings/secrets/actions):

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ZAPSTORE_NSEC`

Tag a release to build all platforms:

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Documentation

Generated API documentation is checked into the repo at `docs/` and published on GitHub Pages:

- Local docs: `docs/index.html`
- [GitHub Pages docs](https://imattau.github.io/XMPP_P2P/)

---

## Running the Application

### Starting the terminal client

Start the interactive terminal client on a specific port:

```bash
npm start -- --port=9001
```

You can optionally define the hostname and SQLite state path:
```bash
npm start -- --port=9001 --host=127.0.0.1 --sqlite-path=/path/to/state.sqlite
```

To see the startup flags without launching the node:

```bash
npm start -- --help
npm start -- --version
```

Once started, the terminal client will output your local Peer ID, JID, and listen addresses, then open the TUI.

### Starting the Frontend

The web frontend lives in `ui/`. Run it with:

```bash
npm run ui:dev
```

To build the web app for production:

```bash
npm run ui:build
```

To preview the built frontend:

```bash
npm run ui:preview
```

### Browser peer connectivity

Browser peers need a reachable libp2p relay over a trusted WebSocket connection. A
local web build intentionally ships with an empty `ui/public/bootstrap-config.json`;
without a relay, onboarding and Settings report that peer discovery is unavailable
and the browser has no routable peer address to share. Peer messaging needs a
reachable peer address or relay. Connecting an XMPP account is a separate path and
does not provide a P2P relay.

For a managed deployment, install Caddy, point the domain at the server, allow
HTTP/HTTPS traffic for certificate issuance, and enable the relay behind the
Caddy TLS proxy:

```bash
scripts/deploy-remote.sh --host user@server \
  --proxy caddy --domain app.example.org --relay
```

The daemon writes its root WebSocket multiaddress to the deployed
`ui/dist/bootstrap-config.json` when it starts. If a deployment uses another
operator-managed relay, add its root `/.../wss/p2p/<peer-id>` multiaddress in
Nexus Settings. Addresses with an HTTP path such as `/ws` cannot be used for
browser WebRTC peer routes. If the deploy script warns that it could not add
its snippet to an unmanaged Caddyfile, import the generated snippet and reload
Caddy before relying on the generated address. Never add an untrusted relay
address.

#### Nostr peer discovery

Nostr relays can distribute signed, expiring libp2p bootstrap announcements. They
are used only to find addresses; peer traffic still travels over libp2p. The app
defaults to `relay.ditto.pub`, `nostr-01.yakihonne.com`, and `relay.primal.net`.
Set `XMPP_P2P_NOSTR_RELAYS` to override the node's list; users can add, remove, or
replace the relays used by their app in Settings. On first startup with browser
bootstrap output enabled, the node creates a random publishing key and reuses it
on later starts:

```bash
XMPP_P2P_NOSTR_RELAYS='wss://relay.example,wss://relay2.example' \
XMPP_P2P_BOOTSTRAP_OUTPUT='ui/dist/bootstrap-config.json' \
XMPP_P2P_BOOTSTRAP_DOMAIN='app.example.org' \
XMPP_P2P_BOOTSTRAP_WSS=true \
npm start -- --relay
```

By default, the key is stored in `data/nostr-bootstrap-key` beside the node's
SQLite database with mode 0600. `XMPP_P2P_NOSTR_KEY_PATH` selects another path.
Set `XMPP_P2P_NOSTR_SECRET_KEY` only when importing a key you already manage;
that value takes precedence over the generated key file.

The browser config contains the Nostr relay URLs, not the publisher key. The node
uses its key to sign a kind 30078 announcement and refreshes it every 12 hours.
Discovery filters by the Nexus-specific event kind and `d` identifier, validates
the event signature and expiration, then treats matching addresses as candidates;
it does not maintain a publisher allowlist. In Settings, users only need to enter
Nostr relay URLs. Local `ws://` relays are allowed for testing; remote relays must
use `wss://`.

Run the signed-event and validation checks with `npm run build && npm run
test-nostr-bootstrap`.

The remote deploy script accepts `XMPP_P2P_NOSTR_RELAYS` and the optional
`XMPP_P2P_NOSTR_SECRET_KEY` environment variables.
It transfers the signing key over SSH in a mode-0600 temporary file, then installs
it in `/etc/xmpp-p2p/nostr.env` as root-owned mode 0640 for the service group.
Without an imported key, the daemon generates one in `/var/lib/xmpp-p2p`, which
survives application redeploys. The key is not printed in deploy output or placed
in the browser config.

### Running Verification Tests

The codebase includes an extensive suite of automated verification scripts checking all the XEP implementations. To run the full test suite (which automatically builds the project first):

```bash
npm test
```

Or run individual verification tests:

* **Two-Node Messaging**: `npm run test-nodes`
* **Gossipsub PubSub**: `npm run test-pubsub`
* **Roster Sync**: `npm run test-roster`
* **OMEMO Encryption**: `npm run test-omemo`
* **DHT Operations & Mailbox**: `npm run test-dht`
* **Microblogging Feeds**: `npm run test-feed`
* **MUC Rooms**: `npm run test-muc`
* **MUC + OMEMO Encryption**: `npm run test-muc-omemo`
* **PubSub Attachments**: `npm run test-attachments`
* **HTTP File Uploads**: `npm run test-uploads`
* **Service Discovery**: `npm run test-disco`

#### Browser checks against a real XMPP server

The opt-in browser integration test connects through Settings, exchanges a
direct message and a room message, and publishes/follows XMPP PEP posts. The
Settings connection check needs `XMPP_TEST_JID`, `XMPP_TEST_PASSWORD`, and
`XMPP_TEST_SERVICE`. The two-client checks also need a second, distinct account
in `XMPP_TEST_PEER_JID` and `XMPP_TEST_PEER_PASSWORD`. The paired checks are
skipped when that second account is not configured.

```bash
XMPP_TEST_JID=alice@example.test \
XMPP_TEST_PASSWORD='local-test-password' \
XMPP_TEST_PEER_JID=bob@example.test \
XMPP_TEST_PEER_PASSWORD='another-test-password' \
XMPP_TEST_SERVICE=wss://xmpp.example.test/xmpp-websocket \
npm run test-browser-e2e -- tests-e2e/xmpp-live-bridge.spec.ts
```

Certificate errors are ignored only for `localhost` and loopback endpoints used
by local test servers. Public WebSocket endpoints must have a valid certificate.

---

## Terminal UI

The terminal client opens the feed, topics, compose, chats, profile, and settings views. Use `Tab` to focus navigation, `Escape` to go back, and `q` or `Ctrl-C` to exit.

---

## Project Structure

- `src/index.ts`: Terminal client entry point.
- `src/core/`: Protocol logic and core network nodes.
  - `p2p.ts`: Configures and constructs the underlying libp2p node (transports, Noise, Yamux, Gossipsub, DHT).
  - `xmpp-node.ts`: Handles the main XMPP stanza routing, connection streaming, and module registration.
  - `xmpp-stream.ts`: Converts raw libp2p streams into structured XMPP XML events.
  - `xmpp-dht.ts`: Coordinates DHT records, offline mailboxes, and decentralized room settings.
  - `xmpp-muc.ts`: Implements Multi-User Chat room synchronization.
  - `xmpp-omemo.ts` & `xmpp-omemo-state.ts`: Handle cryptographic sessions and key bundle management for OMEMO E2EE.
- `src/tui/`: Handles the terminal UI, pages, events, and state bridge.
- `src/tests/`: Executable verification scripts for testing features across mock nodes.
