import 'fake-indexeddb/auto'
import { IndexedDbStorage } from '../core/storage/indexeddb-storage.js'
import { runXmppStorageContract } from './storage-contract.js'

async function main() {
  const storage = new IndexedDbStorage('xmpp-storage-test')
  await runXmppStorageContract(storage)
  await storage.close()
  console.log('IndexedDbStorage test passed')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
