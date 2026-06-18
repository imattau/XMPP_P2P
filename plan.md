# Plan: End-to-End OMEMO Encryption for Decentralized MUC

This plan outlines the design, implementation, and verification of END-TO-END OMEMO encrypted decentralized group chats (MUC) over Gossipsub.

## Objective
Implement end-to-end OMEMO group chat encryption in our P2P XMPP client. Users should be able to send encrypted group messages that can be decrypted only by authorized occupants currently in the MUC room.

## Strategy
1. **OMEMO Recipient Compilation**: Collect the JIDs of all occupants in the room. For each occupant, fetch their OMEMO device IDs.
2. **Encrypted Payload Construction**: Encrypt the message body with a random symmetric key (AES-GCM), encrypt the symmetric key for each occupant device using their OMEMO session, and serialize the header with recipient JID/device blocks.
3. **Incoming Decryption**: Listen for `<encrypted xmlns="urn:xmpp:omemo:2">` payloads on the room's Gossipsub topic, find our JID and device ID key, decrypt the symmetric key, and decrypt the group message body.

---

## Tasks

### 1. Research & Audit
- [x] Task 1.1: Verify OMEMO session initialization and state access inside `XmppNode` (ensuring device list caching and OMEMO store are available for MUC JIDs).

### 2. Core Implementation
- [x] Task 2.1: Add decryption support for `<encrypted xmlns="urn:xmpp:omemo:2">` groupchat stanzas in `src/core/xmpp-muc.ts`.
- [x] Task 2.2: Implement `sendGroupMessageSecure(roomName, body)` in `src/core/xmpp-muc.ts` to encrypt and publish MUC stanzas.
- [x] Task 2.3: Add CLI command `muc-send-secure <room> <msg>` in `src/cli/commands.ts`.
- [x] Task 2.4: Update CLI help printout in `src/cli/output.ts` to expose the secure command.

### 3. Verification & Hardening
- [x] Task 3.1: Create a test script `src/tests/muc-omemo.ts` to spawn two nodes with OMEMO keys, connect them, join an encrypted MUC room, send a secure message, and verify decryption.
- [x] Task 3.2: Register `test-muc-omemo` in `package.json` and ensure it runs in `npm test`.
