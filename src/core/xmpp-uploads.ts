/**
 * @packageDocumentation HTTP upload slot management, upload server lifecycle, and
 * pubsub announcements for uploaded content.
 */

import type { IncomingMessage, Server, ServerResponse } from 'http'
import { createHash } from 'crypto'
import { xml, Element } from '@xmpp/xml'
import { HTTP_UPLOAD_XMLNS } from './xmpp-discovery.js'
import {
  type XmppUploadManifest,
  type XmppUploadProvider
} from './xmpp-records.js'
import type { XmppStorage } from './storage/types.js'

/**
 * Pubsub topic used to broadcast upload manifests.
 */
export const UPLOAD_ANNOUNCEMENTS_TOPIC = 'xmpp-upload:announcements'

/**
 * Runtime dependencies for the upload manager.
 */
export interface XmppUploadContext {
  jid: string
  ready: Promise<void>
  storage: XmppStorage
  uploadPort: number
  uploadHost: string
  getPubSubService(): any
  emit(event: string, ...args: any[]): boolean
}

/**
 * Coordinates HTTP upload hosting and manifest publication.
 */
export class XmppUploadManager {
  private context: XmppUploadContext
  private uploadSlots = new Map<string, { slotId: string; filename: string; contentType: string; size: number; createdAt: string }>()
  private uploadManifests = new Map<string, XmppUploadManifest>()
  private uploadPrefetches = new Map<string, Promise<boolean>>()
  private uploadServer?: Server
  private uploadServerReady?: Promise<void>
  private uploadBaseUrl?: string

  constructor(context: XmppUploadContext) {
    this.context = context
  }

  public async ensureUploadServer(): Promise<void> {
    if (this.uploadServerReady) {
      await this.uploadServerReady
      return
    }

    this.uploadServerReady = (async () => {
      const { createServer } = await import('http')
      this.uploadServer = createServer((req, res) => {
        void this.handleUploadHttpRequest(req, res).catch(err => {
          console.error('[XMPP] Upload server error:', err)
          if (!res.headersSent) {
            res.statusCode = 500
          }
          res.end('upload error')
        })
      })

      await new Promise<void>((resolve, reject) => {
        const server = this.uploadServer as Server
        const onError = (err: Error) => {
          server.off('listening', onListening)
          reject(err)
        }
        const onListening = () => {
          server.off('error', onError)
          resolve()
        }

        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(this.context.uploadPort, this.context.uploadHost)
      })

      const address = this.uploadServer.address()
      if (typeof address === 'object' && address && 'port' in address) {
        const host = this.context.uploadHost.includes(':') ? `[${this.context.uploadHost}]` : this.context.uploadHost
        this.uploadBaseUrl = `http://${host}:${address.port}`
      } else {
        this.uploadBaseUrl = `http://${this.context.uploadHost}:${this.context.uploadPort}`
      }
    })()

    await this.uploadServerReady
  }

  public async ensureUploadAnnouncementSubscription(): Promise<void> {
    const pubsub = this.context.getPubSubService()
    await pubsub.subscribe(UPLOAD_ANNOUNCEMENTS_TOPIC)
  }

  private normalizeUploadProviders(manifest: XmppUploadManifest): XmppUploadProvider[] {
    const providers = [...(manifest.providers ?? []), { url: manifest.getUrl, jid: manifest.from }]
    const merged = new Map<string, XmppUploadProvider>()

    for (const provider of providers) {
      if (!provider.url) {
        continue
      }

      const existing = merged.get(provider.url)
      if (existing) {
        merged.set(provider.url, {
          url: existing.url,
          jid: existing.jid || provider.jid
        })
      } else {
        merged.set(provider.url, {
          url: provider.url,
          jid: provider.jid
        })
      }
    }

    return Array.from(merged.values())
  }

  private getLocalUploadProviderUrl(cid: string): string | undefined {
    return this.getUploadContentUrl(cid)
  }

  private buildUploadProviders(manifest: XmppUploadManifest): XmppUploadProvider[] {
    const providers = this.normalizeUploadProviders(manifest)
    const localUrl = this.getLocalUploadProviderUrl(manifest.cid)
    if (localUrl && !providers.some(provider => provider.url === localUrl)) {
      providers.unshift({
        url: localUrl,
        jid: this.context.jid
      })
    }
    return providers
  }

  private async hasUploadObject(cid: string): Promise<boolean> {
    return (await this.context.storage.getBlob('uploads', cid)) !== undefined
  }

  public getUploadContentUrl(cid: string): string | undefined {
    if (!this.uploadBaseUrl) {
      return undefined
    }

    return `${this.uploadBaseUrl}/ipfs/${encodeURIComponent(cid)}`
  }

  private async announceUploadManifest(manifest: XmppUploadManifest): Promise<void> {
    const providers = this.buildUploadProviders(manifest)
    const pubsub = this.context.getPubSubService()
    const stanza = xml(
      'message',
      {
        from: this.context.jid,
        to: 'pubsub.p2p',
        type: 'headline'
      },
      xml(
        'event',
        { xmlns: 'http://jabber.org/protocol/pubsub#event' },
        xml(
          'items',
          { node: UPLOAD_ANNOUNCEMENTS_TOPIC },
          xml(
            'item',
            { id: manifest.cid, cid: manifest.cid, slotId: manifest.slotId ?? '', uploadedAt: manifest.uploadedAt },
            xml(
              'upload',
              {
                xmlns: HTTP_UPLOAD_XMLNS,
                cid: manifest.cid,
                url: manifest.getUrl,
                filename: manifest.filename ?? '',
                contentType: manifest.contentType ?? 'application/octet-stream',
                size: manifest.size != null ? String(manifest.size) : '',
                slotId: manifest.slotId ?? '',
                uploadedAt: manifest.uploadedAt,
                from: manifest.from
              },
              xml(
                'providers',
                { xmlns: HTTP_UPLOAD_XMLNS },
                ...providers.map(provider => xml(
                  'provider',
                  {
                    url: provider.url,
                    jid: provider.jid ?? ''
                  }
                ))
              )
            )
          )
        )
      )
    )

    await pubsub.publish(UPLOAD_ANNOUNCEMENTS_TOPIC, new TextEncoder().encode(stanza.toString()))
  }

  private async storeUploadObject(manifest: XmppUploadManifest, payload: Buffer): Promise<void> {
    const providers = this.buildUploadProviders(manifest)
    await this.context.storage.putBlob('uploads', manifest.cid, new Uint8Array(payload))
    await this.context.storage.putRecord('uploads_meta', manifest.cid, JSON.stringify({
      cid: manifest.cid,
      slotId: manifest.slotId,
      filename: manifest.filename,
      contentType: manifest.contentType,
      size: manifest.size,
      uploadedAt: manifest.uploadedAt,
      sourceUrl: manifest.getUrl,
      from: manifest.from,
      providers,
      cachedAt: new Date().toISOString()
    }), new Date().toISOString())
  }

  private sortUploadProviders(manifest: XmppUploadManifest, providers: XmppUploadProvider[]): XmppUploadProvider[] {
    const seed = this.context.jid
    return [...providers].sort((left, right) => {
      const leftScore = createHash('sha256').update(manifest.cid).update(seed).update(left.url).digest().readUInt32BE(0)
      const rightScore = createHash('sha256').update(manifest.cid).update(seed).update(right.url).digest().readUInt32BE(0)
      return leftScore - rightScore
    })
  }

  private async fetchUploadFromProvider(url: string): Promise<Buffer | undefined> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) {
        return undefined
      }
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length === 0) {
        return undefined
      }
      return bytes
    } catch {
      return undefined
    } finally {
      clearTimeout(timeout)
    }
  }

  private async fetchAndCacheUpload(manifest: XmppUploadManifest): Promise<boolean> {
    if (await this.hasUploadObject(manifest.cid)) {
      return true
    }

    const remoteProviders = this.sortUploadProviders(manifest, this.normalizeUploadProviders(manifest))
    const localUrl = this.getLocalUploadProviderUrl(manifest.cid)
    const hadLocalProvider = remoteProviders.some(candidate => candidate.url === localUrl)
    for (const provider of remoteProviders) {
      const bytes = await this.fetchUploadFromProvider(provider.url)
      if (!bytes) {
        continue
      }

      const cid = createHash('sha256').update(bytes).digest('hex')
      if (cid !== manifest.cid) {
        continue
      }

      const nextManifest: XmppUploadManifest = {
        ...manifest,
        providers: remoteProviders
      }
      const announcedManifest = localUrl && !hadLocalProvider
        ? {
            ...nextManifest,
            providers: [...remoteProviders, { url: localUrl, jid: this.context.jid }]
          }
        : nextManifest

      await this.storeUploadObject(announcedManifest, bytes)

      if (localUrl && !hadLocalProvider) {
        await this.announceUploadManifest(announcedManifest)
      }

      return true
    }

    return false
  }

  public async recordUploadManifest(manifest: XmppUploadManifest, sourceJid: string): Promise<boolean> {
    await this.context.ready
    const normalized: XmppUploadManifest = {
      cid: manifest.cid,
      slotId: manifest.slotId,
      filename: manifest.filename,
      contentType: manifest.contentType,
      size: manifest.size,
      getUrl: manifest.getUrl,
      providers: this.normalizeUploadProviders(manifest),
      uploadedAt: manifest.uploadedAt || new Date().toISOString(),
      from: sourceJid,
      topic: manifest.topic ?? UPLOAD_ANNOUNCEMENTS_TOPIC
    }

    const existing = this.uploadManifests.get(normalized.cid)
    const mergedProviders = this.normalizeUploadProviders({
      ...normalized,
      providers: [...(existing?.providers ?? []), ...(normalized.providers ?? [])]
    })
    const merged: XmppUploadManifest = {
      ...normalized,
      providers: mergedProviders
    }

    this.uploadManifests.set(normalized.cid, merged)

    const localUrl = this.getLocalUploadProviderUrl(normalized.cid)
    if (localUrl && await this.hasUploadObject(normalized.cid) && !mergedProviders.some(provider => provider.url === localUrl)) {
      const localManifest: XmppUploadManifest = {
        ...merged,
        providers: [...mergedProviders, { url: localUrl, jid: this.context.jid }]
      }
      this.uploadManifests.set(normalized.cid, localManifest)
      void this.announceUploadManifest(localManifest).catch(err => this.context.emit('error', err))
      return !existing
    }

    if (sourceJid === this.context.jid) {
      return !existing
    }

    if (!this.uploadPrefetches.has(normalized.cid)) {
      this.uploadPrefetches.set(
        normalized.cid,
        this.fetchAndCacheUpload(merged)
          .catch(err => this.context.emit('error', err))
          .finally(() => {
            this.uploadPrefetches.delete(normalized.cid)
          })
      )
    }

    return !existing
  }

  private async readUploadAlias(slotId: string): Promise<{ cid: string } | undefined> {
    const raw = await this.context.storage.getRecord('uploads_alias', slotId)
    if (raw === undefined) {
      return undefined
    }
    const parsed = JSON.parse(raw) as { cid?: string }
    if (typeof parsed.cid === 'string' && parsed.cid.length > 0) {
      return { cid: parsed.cid }
    }
    return undefined
  }

  private async readUploadMeta(cid: string): Promise<{ filename?: string; contentType?: string; size?: number; slotId?: string } | undefined> {
    const raw = await this.context.storage.getRecord('uploads_meta', cid)
    if (raw === undefined) {
      return undefined
    }
    return JSON.parse(raw) as { filename?: string; contentType?: string; size?: number; slotId?: string }
  }

  public async handleUploadHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.uploadBaseUrl) {
      res.statusCode = 503
      res.end('upload server not ready')
      return
    }

    const requestUrl = new URL(req.url ?? '/', this.uploadBaseUrl)
    const pathParts = requestUrl.pathname.split('/').filter(Boolean)

    if (pathParts.length !== 2 || pathParts[0] !== 'ipfs' && pathParts[0] !== 'upload') {
      res.statusCode = 404
      res.end('not found')
      return
    }

    if (pathParts[0] === 'upload') {
      const slotId = decodeURIComponent(pathParts[1])
      if (req.method !== 'PUT') {
        res.statusCode = 405
        res.setHeader('Allow', 'PUT')
        res.end('method not allowed')
        return
      }

      const slot = this.uploadSlots.get(slotId)
      if (!slot) {
        res.statusCode = 404
        res.end('unknown upload slot')
        return
      }

      const chunks: Buffer[] = []
      let total = 0
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        total += buffer.length
        if (total > slot.size) {
          res.statusCode = 413
          res.end('upload exceeds declared size')
          return
        }
        chunks.push(buffer)
      }

      if (total !== slot.size) {
        res.statusCode = 400
        res.end('upload size mismatch')
        return
      }

      const payload = Buffer.concat(chunks)
      const cid = createHash('sha256').update(payload).digest('hex')

      await this.context.storage.putBlob('uploads', cid, new Uint8Array(payload))
      await this.context.storage.putRecord('uploads_meta', cid, JSON.stringify({
        cid,
        slotId,
        filename: slot.filename,
        contentType: slot.contentType,
        size: slot.size,
        uploadedAt: new Date().toISOString()
      }), new Date().toISOString())
      await this.context.storage.putRecord('uploads_alias', slotId, JSON.stringify({
        cid,
        slotId,
        uploadedAt: new Date().toISOString()
      }), new Date().toISOString())
      this.uploadSlots.delete(slotId)

      const manifest: XmppUploadManifest = {
        cid,
        slotId,
        filename: slot.filename,
        contentType: slot.contentType,
        size: slot.size,
        getUrl: `${this.uploadBaseUrl}/ipfs/${cid}`,
        uploadedAt: new Date().toISOString(),
        from: this.context.jid,
        topic: UPLOAD_ANNOUNCEMENTS_TOPIC
      }
      this.uploadManifests.set(cid, manifest)
      void this.announceUploadManifest(manifest).catch(err => this.context.emit('error', err))

      res.statusCode = 201
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Location', `${this.uploadBaseUrl}/ipfs/${cid}`)
      res.end(JSON.stringify({ cid, url: `${this.uploadBaseUrl}/ipfs/${cid}` }))
      return
    }

    const ipfsId = decodeURIComponent(pathParts[1])
    const alias = await this.readUploadAlias(ipfsId)
    if (alias) {
      res.statusCode = 302
      res.setHeader('Location', `${this.uploadBaseUrl}/ipfs/${alias.cid}`)
      res.end()
      return
    }

    const objectMeta = await this.readUploadMeta(ipfsId)
    let data = await this.context.storage.getBlob('uploads', ipfsId)
    if (!data) {
      const manifest = this.uploadManifests.get(ipfsId)
      if (manifest && await this.fetchAndCacheUpload(manifest)) {
        data = await this.context.storage.getBlob('uploads', ipfsId)
      }
    }

    if (!data) {
      res.statusCode = 404
      res.end('not found')
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', objectMeta?.contentType ?? 'application/octet-stream')
    res.setHeader('Content-Length', String(data.length))
    if (objectMeta?.filename) {
      res.setHeader('Content-Disposition', `attachment; filename="${objectMeta.filename.replace(/\"/g, '\\"')}"`)
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.end(Buffer.from(data))
  }

  public async createUploadSlot(slotId: string, filename: string, contentType: string, size: number): Promise<Element> {
    await this.ensureUploadServer()
    if (!this.uploadBaseUrl) {
      throw new Error('Upload server was not initialised')
    }

    const normalized = {
      slotId,
      filename: filename.trim() || 'upload.bin',
      contentType: contentType.trim() || 'application/octet-stream',
      size,
      createdAt: new Date().toISOString()
    }
    this.uploadSlots.set(slotId, normalized)

    return xml(
      'slot',
      { xmlns: HTTP_UPLOAD_XMLNS },
      xml('put', { url: `${this.uploadBaseUrl}/upload/${encodeURIComponent(slotId)}` }),
      xml('get', { url: `${this.uploadBaseUrl}/ipfs/${encodeURIComponent(slotId)}` })
    )
  }

  public async close(): Promise<void> {
    if (this.uploadServer) {
      await new Promise<void>(resolve => {
        this.uploadServer?.close(() => resolve())
      })
      this.uploadServer = undefined
      this.uploadServerReady = undefined
    }
  }
}
