import * as openpgp from 'openpgp'
import type { XmppStorage } from './storage/types.js'
import { persistOpenPgpState } from './xmpp-persistence.js'
import { type XmppOpenPgpStateFile } from './xmpp-records.js'

export class XmppOpenPgpStateManager {
  private state?: XmppOpenPgpStateFile
  private privateKey?: openpgp.PrivateKey
  private publicKey?: openpgp.PublicKey
  private fingerprint?: string
  private saveQueue: Promise<void> = Promise.resolve()

  constructor(
    private readonly storage: XmppStorage,
    private readonly jid: string
  ) {}

  async load(): Promise<void> {
    const raw = await this.storage.getRecord('openpgp', 'state')
    if (raw === undefined) {
      await this.generate()
      return
    }

    const parsed = JSON.parse(raw) as XmppOpenPgpStateFile
    if (!parsed.privateKey || !parsed.publicKey || !parsed.fingerprint) {
      throw new Error('OpenPGP state file is missing key material')
    }

    this.state = parsed
    this.privateKey = await openpgp.readPrivateKey({ armoredKey: parsed.privateKey })
    this.publicKey = await openpgp.readKey({ armoredKey: parsed.publicKey })
    this.fingerprint = parsed.fingerprint
  }

  async generate(): Promise<void> {
    const generated = await openpgp.generateKey({
      userIDs: [{ name: this.jid, email: this.jid }],
      type: 'curve25519',
      format: 'armored'
    })

    const publicKey = await openpgp.readKey({ armoredKey: generated.publicKey })
    this.state = {
      version: 1,
      privateKey: generated.privateKey,
      publicKey: generated.publicKey,
      fingerprint: publicKey.getFingerprint(),
      createdAt: new Date().toISOString()
    }
    this.privateKey = await openpgp.readPrivateKey({ armoredKey: generated.privateKey })
    this.publicKey = publicKey
    this.fingerprint = publicKey.getFingerprint()
    await this.persist()
  }

  async persist(): Promise<void> {
    await persistOpenPgpState(this.storage, this.state)
  }

  schedulePersist(): Promise<void> {
    this.saveQueue = this.saveQueue
      .then(() => this.persist())
      .catch(err => {
        console.error('[XMPP] Failed to persist OpenPGP state:', err)
      })

    return this.saveQueue
  }

  getState(): XmppOpenPgpStateFile | undefined {
    return this.state
  }

  getPrivateKey(): openpgp.PrivateKey | undefined {
    return this.privateKey
  }

  getPrivateKeyOrThrow(): openpgp.PrivateKey {
    if (!this.privateKey) {
      throw new Error('OpenPGP private key is not loaded')
    }
    return this.privateKey
  }

  getPublicKey(): openpgp.PublicKey | undefined {
    return this.publicKey
  }

  getPublicKeyOrThrow(): openpgp.PublicKey {
    if (!this.publicKey) {
      throw new Error('OpenPGP public key is not loaded')
    }
    return this.publicKey
  }

  getPublicKeyText(): string {
    return this.state?.publicKey ?? ''
  }

  getFingerprint(): string {
    return this.fingerprint ?? this.state?.fingerprint ?? ''
  }

  async close(): Promise<void> {
    await this.saveQueue
    await this.persist()
  }
}
