/**
 * @packageDocumentation Minimal static file server for the Electron renderer.
 *
 * The window is loaded over `http://127.0.0.1:<port>` instead of `file://`
 * because localhost is a secure context, which the OMEMO AES-GCM code and the
 * recovery-phrase PBKDF2 derivation require.
 */

import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' ws: wss: http: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ')

/** The renderer origin is part of the storage key; keep it stable. */
export const DEFAULT_RENDERER_PORT = 43117

function contentType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Starts the local renderer server.
 *
 * @param rootDirectory - Directory containing the built `ui/dist` files.
 * @param port - Fixed port; a stable origin preserves localStorage/IndexedDB.
 * @returns The renderer URL and a close function.
 */
export async function startStaticServer(
  rootDirectory: string,
  port: number = DEFAULT_RENDERER_PORT
): Promise<{ url: string; close: () => Promise<void> }> {
  const root = path.resolve(rootDirectory)
  const indexFile = path.join(root, 'index.html')

  const handler = async (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => {
    try {
      const requestUrl = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
      const decoded = decodeURIComponent(requestUrl.pathname)
      let target = path.resolve(root, `.${decoded}`)

      if (!target.startsWith(root + path.sep) && target !== root) {
        response.writeHead(403).end('Forbidden')
        return
      }

      if (decoded === '/' || path.extname(decoded) === '') {
        target = indexFile
      }

      let body: Buffer
      try {
        body = await readFile(target)
      } catch {
        if (path.extname(target) === '') {
          body = await readFile(indexFile)
          target = indexFile
        } else {
          response.writeHead(404).end('Not found')
          return
        }
      }

      response.writeHead(200, {
        'Content-Type': contentType(target),
        'Content-Length': body.byteLength,
        'Cache-Control': 'no-cache',
        'Content-Security-Policy': CSP,
        'X-Content-Type-Options': 'nosniff'
      })
      response.end(body)
    } catch (error) {
      response.writeHead(500).end(error instanceof Error ? error.message : 'Internal error')
    }
  }

  const server: Server = createServer((request, response) => { void handler(request, response) })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve())
  })

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}

/** Resolves `ui/dist` for both development and packaged (asar) runs. */
export function rendererRoot(appPath: string): string {
  return path.join(appPath, 'ui', 'dist')
}

/** Kept for tests that need the compiled module directory. */
export const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
