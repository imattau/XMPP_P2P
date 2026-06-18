/**
 * @fileoverview Reliability manager for XMPP sessions.
 * Tracks client connection states (Active/Inactive) according to XEP-0352 CSI,
 * and maintains Stream Management session state across re-dials.
 */

import { Element } from '@xmpp/xml'

/**
 * Holds Stream Management state (XEP-0198) for a connection session,
 * allowing tracking of stanza acknowledgment counts and outstanding unacknowledged stanzas.
 */
export interface StreamSession {
  sessionId: string
  outboundStanzaCount: number
  inboundStanzaCount: number
  unackedQueue: Element[]
}

/**
 * Manages peer connection states and buffers/recovers Stream Management sessions.
 * Used to implement Client State Indication (XEP-0352) and session resumption (XEP-0198).
 */
export class XmppReliabilityManager {
  private peerClientStates = new Map<string, 'active' | 'inactive'>()
  private streamSessions = new Map<string, StreamSession>()
  public clientState: 'active' | 'inactive' = 'active'

  /**
   * Updates the tracked client state (active or inactive) for a remote peer.
   * 
   * @param peerId - The remote peer identifier.
   * @param state - The client state (active/inactive).
   */
  setPeerClientState(peerId: string, state: 'active' | 'inactive') {
    this.peerClientStates.set(peerId, state)
  }

  /**
   * Retrieves the current client state of a remote peer.
   * 
   * @param peerId - The remote peer identifier.
   * @returns The client state or undefined if not tracked.
   */
  getPeerClientState(peerId: string): 'active' | 'inactive' | undefined {
    return this.peerClientStates.get(peerId)
  }

  /**
   * Helper check to determine if a remote peer is marked as inactive.
   * 
   * @param peerId - The remote peer identifier.
   * @returns True if the peer client state is 'inactive'.
   */
  isPeerInactive(peerId: string): boolean {
    return this.peerClientStates.get(peerId) === 'inactive'
  }

  /**
   * Stores Stream Management session details for a peer to allow resumption after disconnect.
   * 
   * @param peerId - The remote peer identifier.
   * @param session - The session state configuration.
   */
  saveSession(peerId: string, session: StreamSession) {
    this.streamSessions.set(peerId, session)
  }

  /**
   * Retrieves and clears the saved Stream Management session configuration for resumption.
   * 
   * @param peerId - The remote peer identifier.
   * @returns The StreamSession or undefined.
   */
  getAndClearSession(peerId: string): StreamSession | undefined {
    const session = this.streamSessions.get(peerId)
    if (session) {
      this.streamSessions.delete(peerId)
    }
    return session
  }

  /**
   * Clears all session cache data and tracked peer client states.
   */
  clear() {
    this.streamSessions.clear()
    this.peerClientStates.clear()
  }
}
