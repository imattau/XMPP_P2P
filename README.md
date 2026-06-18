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

---

## Running the Application

### Starting the CLI

Start an interactive CLI node on a specific port:

```bash
npm start -- --port=9001
```

You can optionally define the hostname and roster path:
```bash
npm start -- --port=9001 --host=127.0.0.1 --roster-file=/path/to/roster.json
```

Once started, the CLI will output your local Peer ID, JID, and listen addresses, and drop you into an interactive `xmpp-p2p>` prompt.

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

---

## CLI Commands Reference

Type `help` in the CLI to see all available commands. The main command categories are:

| Category | Commands | Description |
|---|---|---|
| **System** | `id`, `peers`, `dial`, `ping`, `help`, `exit` | View local identifiers, discover peers, manually connect, and test latency. |
| **Messaging** | `msg <peer> <text>` <br> `msg secure <peer> <text>` <br> `msg correct [secure] <peer> <id> <text>` <br> `msg state <peer> <state>` | Send plaintext or OMEMO-encrypted direct messages, correct previous messages, or send chat states. |
| **Presence & Profile** | `presence <status>` <br> `presence subscribe/unsubscribe <peer>` <br> `nick <name>` | Broadcast custom status, manage presence subscriptions, or set nickname. |
| **Roster** | `roster list` <br> `roster add <jid> [name]` <br> `roster remove <jid>` <br> `roster fetch <peer>` | Manage and retrieve contact roster. |
| **Feeds** | `feed post <msg> [--title <title>] [--tag <tag>] [--cover <path>]` <br> `feed article <msg> [--title <title>] [--tag <tag>] [--cover <path>] [--cover-target <peer>]` <br> `feed subscribe <peer> [public/private]` <br> `feed list` <br> `feed followers <peer>` | Publish feed updates and articles, follow peers, view posts, and track followers. |
| **Collections** | `collection create <id> [name]` <br> `collection join <id>` <br> `collection posts [id]` | Group multiple user feeds into unified channels. |
| **MUC Rooms** | `muc-join <room> <nick>` <br> `muc-send <room> <msg>` <br> `muc-send-secure <room> <msg>` <br> `muc-roster <room>` | Decentralized multi-user group chat rooms. |
| **OMEMO / PGP** | `omemo key`, `omemo fetch <peer>` <br> `openpgp key`, `openpgp fetch <peer>` | View local cryptographic keys or fetch keys from a remote peer. |
| **PubSub** | `pubsub-sub <topic>`, `pubsub-pub <topic> <msg>` <br> `pubsub-react <topic> <id> <emoji>` <br> `pubsub-attachments [topic]` | Generic PubSub topic subscriptions, emoji reactions, and attachment logs. |

---

## Project Structure

- `src/index.ts`: CLI entry point.
- `src/core/`: Protocol logic and core network nodes.
  - `p2p.ts`: Configures and constructs the underlying libp2p node (transports, Noise, Yamux, Gossipsub, DHT).
  - `xmpp-node.ts`: Handles the main XMPP stanza routing, connection streaming, and module registration.
  - `xmpp-stream.ts`: Converts raw libp2p streams into structured XMPP XML events.
  - `xmpp-dht.ts`: Coordinates DHT records, offline mailboxes, and decentralized room settings.
  - `xmpp-muc.ts`: Implements Multi-User Chat room synchronization.
  - `xmpp-omemo.ts` & `xmpp-omemo-state.ts`: Handle cryptographic sessions and key bundle management for OMEMO E2EE.
- `src/cli/`: Handles CLI parsing, interactive keyboard sessions, events, and print formatting.
- `src/tests/`: Executable verification scripts for testing features across mock nodes.
