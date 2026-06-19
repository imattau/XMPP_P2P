import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { NodeSqliteStorage } from '../core/storage/node-sqlite-storage.js'
import { runXmppStorageContract } from './storage-contract.js'

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'xmpp-storage-sqlite-'))
  const dbPath = join(dir, 'state.sqlite')
  const storage = new NodeSqliteStorage(dbPath)

  await runXmppStorageContract(storage)

  // sqlite-specific: state survives reopening the same file
  await storage.putRecord('roster', 'bob@example.com', JSON.stringify({ jid: 'bob@example.com' }), '2026-01-01T00:00:00.000Z')
  await storage.close()

  const reopened = new NodeSqliteStorage(dbPath)
  const raw = await reopened.getRecord('roster', 'bob@example.com')
  assert.equal(raw, JSON.stringify({ jid: 'bob@example.com' }))
  await reopened.close()

  await rm(dir, { recursive: true, force: true })
  console.log('NodeSqliteStorage test passed')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
