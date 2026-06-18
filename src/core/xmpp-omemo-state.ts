import { promises as fs } from 'fs'
import { dirname } from 'path'
import { xml, Element } from '@xmpp/xml'
import { loadOmemoModule } from './omemo-runtime.js'
import type { OmemoDirection } from './omemo-runtime.js'
import {
  bufferToBase64,
  base64ToArrayBuffer,
  serializeKeyPair,
  deserializeKeyPair
} from './xmpp-utils.js'

export interface XmppOmemoStateFile {
  version: number
  deviceId: number
  registrationId: number
  store: Record<string, unknown>
  identityKeyPair: {
    pubKey: string
    privKey: string
  }
  signedPreKey: {
    keyId: number
    keyPair: {
      pubKey: string
      privKey: string
    }
    signature: string
  }
  preKeys: Array<{
    keyId: number
    keyPair: {
      pubKey: string
      privKey: string
    }
  }>
  identities: Record<string, string>
  sessions: Record<string, string>
}

export interface XmppOmemoBundle {
  deviceId: number
  registrationId: number
  identityKey: string
  signedPreKeyId: number
  signedPreKey: string
  signedPreKeySignature: string
  preKeys: Array<{
    keyId: number
    publicKey: string
  }>
}

export class XmppOmemoStateManager {
  private state?: XmppOmemoStateFile
  private deviceId = 0
  private registrationId = 0
  private identityKeyPair?: {
    pubKey: ArrayBuffer
    privKey: ArrayBuffer
  }
  private signedPreKey?: {
    keyId: number
    keyPair: {
      pubKey: ArrayBuffer
      privKey: ArrayBuffer
    }
    signature: ArrayBuffer
  }
  private readonly preKeys = new Map<number, {
    pubKey: ArrayBuffer
    privKey: ArrayBuffer
  }>()
  private readonly storeData = new Map<string, unknown>()
  private readonly peerIdentityKeys = new Map<string, string>()
  private saveQueue: Promise<void> = Promise.resolve()

  constructor(private readonly omemoPath: string) {}

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.omemoPath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<XmppOmemoStateFile>
      if (!parsed.deviceId || !parsed.registrationId || !parsed.identityKeyPair || !parsed.signedPreKey) {
        throw new Error('OMEMO state file is missing key material')
      }

      this.state = {
        version: parsed.version ?? 1,
        deviceId: parsed.deviceId,
        registrationId: parsed.registrationId,
        store: parsed.store ?? {},
        identityKeyPair: parsed.identityKeyPair,
        signedPreKey: parsed.signedPreKey,
        preKeys: parsed.preKeys ?? [],
        identities: parsed.identities ?? {},
        sessions: parsed.sessions ?? {}
      }
      this.deviceId = parsed.deviceId
      this.registrationId = parsed.registrationId
      this.identityKeyPair = deserializeKeyPair(parsed.identityKeyPair)
      this.signedPreKey = {
        keyId: parsed.signedPreKey.keyId,
        keyPair: deserializeKeyPair(parsed.signedPreKey.keyPair),
        signature: base64ToArrayBuffer(parsed.signedPreKey.signature)
      }
      this.storeData.clear()
      for (const [key, value] of Object.entries(parsed.store ?? {})) {
        this.storeData.set(key, value)
      }
      this.preKeys.clear()
      for (const preKey of this.state.preKeys) {
        this.preKeys.set(preKey.keyId, deserializeKeyPair(preKey.keyPair))
      }
      this.peerIdentityKeys.clear()
      for (const [address, identityKey] of Object.entries(this.state.identities)) {
        this.peerIdentityKeys.set(address, identityKey)
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.error(`[XMPP] Failed to load OMEMO state from ${this.omemoPath}:`, err)
      }

      await this.generate()
    }
  }

  getDeviceId(): number {
    if (!this.deviceId) {
      throw new Error('OMEMO device id is not loaded')
    }

    return this.deviceId
  }

  getRegistrationId(): number {
    if (!this.registrationId) {
      throw new Error('OMEMO registration id is not loaded')
    }

    return this.registrationId
  }

  getIdentityKeyPair() {
    if (!this.identityKeyPair) {
      throw new Error('OMEMO identity key pair is not loaded')
    }

    return this.identityKeyPair
  }

  getSignedPreKey() {
    if (!this.signedPreKey) {
      throw new Error('OMEMO signed pre-key is not loaded')
    }

    return this.signedPreKey
  }

  getBundle(): XmppOmemoBundle {
    const identityKeyPair = this.getIdentityKeyPair()
    const signedPreKey = this.getSignedPreKey()

    return {
      deviceId: this.getDeviceId(),
      registrationId: this.getRegistrationId(),
      identityKey: bufferToBase64(identityKeyPair.pubKey),
      signedPreKeyId: signedPreKey.keyId,
      signedPreKey: bufferToBase64(signedPreKey.keyPair.pubKey),
      signedPreKeySignature: bufferToBase64(signedPreKey.signature),
      preKeys: Array.from(this.preKeys.entries()).map(([keyId, keyPair]) => ({
        keyId,
        publicKey: bufferToBase64(keyPair.pubKey)
      }))
    }
  }

  buildDevicesQuery(): Element {
    if (!this.state) {
      return xml('pubsub', { xmlns: 'http://jabber.org/protocol/pubsub' })
    }

    return xml(
      'pubsub',
      { xmlns: 'http://jabber.org/protocol/pubsub' },
      xml(
        'items',
        { node: 'urn:xmpp:omemo:2:devices' },
        xml(
          'item',
          { id: 'current' },
          xml(
            'list',
            { xmlns: 'urn:xmpp:omemo:2:devices' },
            xml('device', { id: String(this.deviceId) })
          )
        )
      )
    )
  }

  buildBundleQuery(deviceId: number): Element {
    const bundle = this.getBundle()
    if (bundle.deviceId !== deviceId) {
      throw new Error(`No OMEMO bundle available for device ${deviceId}`)
    }

    return xml(
      'pubsub',
      { xmlns: 'http://jabber.org/protocol/pubsub' },
      xml(
        'items',
        { node: 'urn:xmpp:omemo:2:bundles' },
        xml(
          'item',
          { id: String(deviceId), registrationId: String(bundle.registrationId) },
          xml(
            'bundle',
            { xmlns: 'urn:xmpp:omemo:2' },
            xml('ik', {}, bundle.identityKey),
            xml('spk', { id: String(bundle.signedPreKeyId) }, bundle.signedPreKey),
            xml('spks', {}, bundle.signedPreKeySignature),
            ...bundle.preKeys.map(preKey => xml('pk', { id: String(preKey.keyId) }, preKey.publicKey))
          )
        )
      )
    )
  }

  getStore(): {
    store: Record<string, unknown>
    put: (key: string, value: unknown) => void
    get: <T = unknown>(key: string, defaultValue?: T) => T | undefined
    remove: (key: string) => void
    isTrustedIdentity: (address: string, identityKey: ArrayBuffer, direction: OmemoDirection) => boolean | Promise<boolean>
    loadIdentityKey: (address: string) => ArrayBuffer | undefined
    saveIdentity: (address: string, identityKey: ArrayBuffer) => boolean
    loadPreKey: (keyId: number) => Promise<{ keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer } } | undefined>
    storePreKey: (keyId: number, keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer }) => void
    removePreKey: (keyId: number) => void
    loadSignedPreKey: (keyId: number) => { keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer } } | undefined
    storeSignedPreKey: (keyId: number, keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer }) => void
    removeSignedPreKey: (keyId: number) => void
    loadSession: (address: string) => string | undefined
    removeAllSessions: (jid: string) => void
    removeSession: (address: string) => void
    storeSession: (address: string, record: string) => void
    getIdentityKeyPair: () => Promise<{ pubKey: ArrayBuffer; privKey: ArrayBuffer } | undefined>
    getLocalRegistrationId: () => Promise<number | undefined>
  } {
    return {
      store: Object.fromEntries(this.storeData.entries()),
      put: (key: string, value: unknown) => {
        this.ensureState()
        this.storeData.set(key, value)
        void this.schedulePersist()
      },
      get: <T = unknown>(key: string, defaultValue?: T) => {
        this.ensureState()
        return (this.storeData.get(key) as T | undefined) ?? defaultValue
      },
      remove: (key: string) => {
        this.ensureState()
        this.storeData.delete(key)
        void this.schedulePersist()
      },
      isTrustedIdentity: (address: string, identityKey: ArrayBuffer) => {
        const current = this.peerIdentityKeys.get(address)
        const encoded = bufferToBase64(identityKey)
        if (!current) {
          this.peerIdentityKeys.set(address, encoded)
          const state = this.ensureState()
          state.identities[address] = encoded
          void this.schedulePersist()
          return true
        }

        return current === encoded
      },
      loadIdentityKey: (address: string) => {
        const encoded = this.peerIdentityKeys.get(address)
        return encoded ? base64ToArrayBuffer(encoded) : undefined
      },
      saveIdentity: (address: string, identityKey: ArrayBuffer) => {
        const encoded = bufferToBase64(identityKey)
        this.peerIdentityKeys.set(address, encoded)
        const state = this.ensureState()
        state.identities[address] = encoded
        void this.schedulePersist()
        return true
      },
      loadPreKey: (keyId: number) => {
        const keyPair = this.preKeys.get(Number(keyId))
        return Promise.resolve(keyPair ? { keyPair } : undefined)
      },
      storePreKey: (keyId: number, keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer }) => {
        this.preKeys.set(Number(keyId), keyPair)
        const state = this.ensureState()
        state.preKeys = Array.from(this.preKeys.entries()).map(([id, pair]) => ({
          keyId: id,
          keyPair: serializeKeyPair(pair)
        }))
        void this.schedulePersist()
      },
      removePreKey: (keyId: number) => {
        this.preKeys.delete(Number(keyId))
        const state = this.ensureState()
        state.preKeys = Array.from(this.preKeys.entries()).map(([id, pair]) => ({
          keyId: id,
          keyPair: serializeKeyPair(pair)
        }))
        void this.schedulePersist()
      },
      loadSignedPreKey: (keyId: number) => {
        const signedPreKey = this.signedPreKey
        if (!signedPreKey || signedPreKey.keyId !== Number(keyId)) {
          return undefined
        }

        return { keyPair: signedPreKey.keyPair }
      },
      storeSignedPreKey: (keyId: number, keyPair: { pubKey: ArrayBuffer; privKey: ArrayBuffer }) => {
        const state = this.ensureState()
        this.signedPreKey = {
          keyId: Number(keyId),
          keyPair,
          signature: this.signedPreKey?.signature ?? new ArrayBuffer(0)
        }
        state.signedPreKey = {
          keyId: Number(keyId),
          keyPair: serializeKeyPair(keyPair),
          signature: bufferToBase64(this.signedPreKey.signature)
        }
        void this.schedulePersist()
      },
      removeSignedPreKey: (keyId: number) => {
        if (this.signedPreKey?.keyId === Number(keyId)) {
          this.signedPreKey = undefined
        }
      },
      loadSession: (address: string) => {
        const state = this.ensureState()
        return state.sessions[address]
      },
      removeAllSessions: (jid: string) => {
        const state = this.ensureState()
        for (const address of Object.keys(state.sessions)) {
          if (address.startsWith(`${jid}.`)) {
            delete state.sessions[address]
          }
        }
        void this.schedulePersist()
      },
      removeSession: (address: string) => {
        const state = this.ensureState()
        delete state.sessions[address]
        void this.schedulePersist()
      },
      storeSession: (address: string, record: string) => {
        const state = this.ensureState()
        state.sessions[address] = record
        void this.schedulePersist()
      },
      getIdentityKeyPair: () => Promise.resolve(this.identityKeyPair),
      getLocalRegistrationId: () => Promise.resolve(this.registrationId)
    }
  }

  async persist(): Promise<void> {
    if (!this.state) {
      return
    }

    this.state.store = Object.fromEntries(this.storeData.entries())
    await fs.mkdir(dirname(this.omemoPath), { recursive: true })
    await fs.writeFile(this.omemoPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8')
  }

  async close(): Promise<void> {
    await this.saveQueue
    await this.persist()
  }

  private ensureState(): XmppOmemoStateFile {
    if (!this.state) {
      throw new Error('OMEMO state is not loaded')
    }

    return this.state
  }

  private async generate(): Promise<void> {
    const omemo = await loadOmemoModule()
    const identityKeyPair = await omemo.KeyHelper.generateIdentityKeyPair()
    const signedPreKey = await omemo.KeyHelper.generateSignedPreKey(identityKeyPair, 1)
    const preKeys = await Promise.all(
      Array.from({ length: 20 }, (_, index) => omemo.KeyHelper.generatePreKey(index + 1))
    )
    const deviceId = Math.floor(Math.random() * 0x7fffffff) || 1
    const registrationId = omemo.KeyHelper.generateRegistrationId()

    this.state = {
      version: 1,
      deviceId,
      registrationId,
      store: {},
      identityKeyPair: serializeKeyPair(identityKeyPair),
      signedPreKey: {
        keyId: signedPreKey.keyId,
        keyPair: serializeKeyPair(signedPreKey.keyPair),
        signature: bufferToBase64(signedPreKey.signature)
      },
      preKeys: preKeys.map(preKey => ({
        keyId: preKey.keyId,
        keyPair: serializeKeyPair(preKey.keyPair)
      })),
      identities: {},
      sessions: {}
    }
    this.deviceId = deviceId
    this.registrationId = registrationId
    this.identityKeyPair = identityKeyPair
    this.signedPreKey = signedPreKey
    this.storeData.clear()
    this.preKeys.clear()
    for (const preKey of preKeys) {
      this.preKeys.set(preKey.keyId, preKey.keyPair)
    }
    await this.persist()
  }


  private schedulePersist(): Promise<void> {
    this.saveQueue = this.saveQueue
      .then(() => this.persist())
      .catch(err => {
        console.error(`[XMPP] Failed to persist OMEMO state to ${this.omemoPath}:`, err)
      })

    return this.saveQueue
  }
}
