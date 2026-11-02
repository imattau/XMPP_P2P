import { constants } from 'node:fs'
import { link, mkdir, open, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { generateSecretKey } from 'nostr-tools/pure'
import { nostrSecretKeyFromString } from './nostr-bootstrap.js'

/** Load the node's persistent throwaway publisher key, creating it once if absent. */
export async function loadOrCreateNostrBootstrapSecretKey(
  keyPath: string,
): Promise<{ secretKey: Uint8Array; created: boolean }> {
  await mkdir(dirname(keyPath), { recursive: true, mode: 0o700 })
  const temporaryPath = `${keyPath}.${process.pid}.${randomUUID()}.tmp`
  let created = false
  try {
    const secretKey = generateSecretKey()
    await writeFile(temporaryPath, `${Buffer.from(secretKey).toString('hex')}\n`, { flag: 'wx', mode: 0o600 })
    try {
      await link(temporaryPath, keyPath)
      created = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  } finally {
    await unlink(temporaryPath).catch(() => {})
  }

  const noFollow = process.platform === 'win32' ? 0 : constants.O_NOFOLLOW
  const file = await open(keyPath, constants.O_RDONLY | noFollow)
  try {
    const metadata = await file.stat()
    if (!metadata.isFile()) throw new Error('Nostr bootstrap key path must be a regular file')
    if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) await file.chmod(0o600)
    const secretKey = nostrSecretKeyFromString(await file.readFile('utf8'))
    return { secretKey, created }
  } finally {
    await file.close()
  }
}
