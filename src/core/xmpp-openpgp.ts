/**
 * @fileoverview OpenPGP key generation, persistence, and lifecycle helpers
 * for the XMPP secure messaging runtime.
 */

import * as openpgp from 'openpgp'
import type { XmppStorage } from './storage/types.js'
import { persistOpenPgpState } from './xmpp-persistence.js'
import { type XmppOpenPgpStateFile } from './xmpp-records.js'

/**
 * Stores the local OpenPGP keypair and persists it asynchronously.
 */
export class XmppOpenPgpStateManager {
  private state?: XmppOpenPgpStateFile
  private privateKey?: openpgp.PrivateKey
  private publicKey?: openpgp.PublicKey
  private fingerprint?: string
  private saveQueue: Promise<void> = Promise.resolve()

  /**
   * Creates a state manager for one local XMPP JID.
   *
   * @param storage - Persistence backend for armored key material.
   * @param jid - Local JID used as the OpenPGP identity.
   */
  constructor(
    private readonly storage: XmppStorage,
    private readonly jid: string
  ) {}

  /**
   * Loads persisted OpenPGP state or generates a fresh keypair.
   *
   * @returns Nothing.
   */
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

  /**
   * Generates a new OpenPGP keypair and persists it immediately.
   *
   * @returns Nothing.
   */
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

  /**
   * Writes the current state file to persistent storage.
   *
   * @returns Nothing.
   */
  async persist(): Promise<void> {
    await persistOpenPgpState(this.storage, this.state)
  }

  /**
   * Queues a persistence write so repeated updates coalesce in order.
   *
   * @returns The in-flight persistence promise.
   */
  schedulePersist(): Promise<void> {
    this.saveQueue = this.saveQueue
      .then(() => this.persist())
      .catch(err => {
        console.error('[XMPP] Failed to persist OpenPGP state:', err)
      })

    return this.saveQueue
  }

  /**
   * Returns the loaded or generated state file.
   *
   * @returns The current state file, if one exists.
   */
  getState(): XmppOpenPgpStateFile | undefined {
    return this.state
  }

  getPrivateKey(): openpgp.PrivateKey | undefined {
    return this.privateKey
  }

  /**
   * Returns the loaded private key or throws if unavailable.
   *
   * @returns The active private key.
   * @throws If the key has not been loaded yet.
   */
  getPrivateKeyOrThrow(): openpgp.PrivateKey {
    if (!this.privateKey) {
      throw new Error('OpenPGP private key is not loaded')
    }
    return this.privateKey
  }

  getPublicKey(): openpgp.PublicKey | undefined {
    return this.publicKey
  }

  /**
   * Returns the loaded public key or throws if unavailable.
   *
   * @returns The active public key.
   * @throws If the key has not been loaded yet.
   */
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
