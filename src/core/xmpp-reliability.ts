import { Element } from '@xmpp/xml'

export interface StreamSession {
  sessionId: string
  outboundStanzaCount: number
  inboundStanzaCount: number
  unackedQueue: Element[]
}

export class XmppReliabilityManager {
  private peerClientStates = new Map<string, 'active' | 'inactive'>()
  private streamSessions = new Map<string, StreamSession>()
  public clientState: 'active' | 'inactive' = 'active'

  setPeerClientState(peerId: string, state: 'active' | 'inactive') {
    this.peerClientStates.set(peerId, state)
  }

  getPeerClientState(peerId: string): 'active' | 'inactive' | undefined {
    return this.peerClientStates.get(peerId)
  }

  isPeerInactive(peerId: string): boolean {
    return this.peerClientStates.get(peerId) === 'inactive'
  }

  saveSession(peerId: string, session: StreamSession) {
    this.streamSessions.set(peerId, session)
  }

  getAndClearSession(peerId: string): StreamSession | undefined {
    const session = this.streamSessions.get(peerId)
    if (session) {
      this.streamSessions.delete(peerId)
    }
    return session
  }

  clear() {
    this.streamSessions.clear()
    this.peerClientStates.clear()
  }
}
