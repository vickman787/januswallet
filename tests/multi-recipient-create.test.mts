import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHandler } from '../server/handler.ts'
import type { Store } from '../server/core.ts'
import type { ProductStore } from '../server/products.ts'

const origin = 'http://localhost:5173'
const bobWallet = '0x2222222222222222222222222222222222222222'
const carolWallet = '0x3333333333333333333333333333333333333333'
const id = '11111111-1111-4111-8111-111111111111'

test('organizer can create a split paying two recipients with exact custom amounts', async () => {
  let saved: { amounts: string[]; payouts?: { recipient: string; amount: string }[] } | undefined
  const profiles = {
    bob: { id: 'bob-id', username: 'bob', display_name: 'Bob', address: bobWallet },
    carol: { id: 'carol-id', username: 'carol', display_name: 'Carol', address: carolWallet },
  }
  const store = {
    async profile() { return { id: 'organizer-id', username: 'organizer', display_name: 'Organizer' } },
    async publicProfile(value: string) { return profiles[value as keyof typeof profiles] ?? null },
  } as unknown as Store
  const products = {
    async profileByUsername(value: string) { return profiles[value as keyof typeof profiles] ?? null },
    async createSplit(_owner: string, _group: string | null, _recipient: string, _kind: string, _total: string,
      _title: string, _description: string, _members: unknown[], amounts: string[],
      payouts?: { recipient: string; amount: string }[]) {
      saved = { amounts, payouts }
      return { id, title: 'Bulk split' }
    },
    async split() { return { split: { id, title: 'Bulk split' }, shares: [], payouts: [] } },
  } as unknown as ProductStore
  const server = createServer(createHandler({ origin, store, products,
    verifyToken: async () => 'organizer', verifyWallet: async () => false }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
    const response = await fetch(base + '/api/splits', {
      method: 'POST', headers: { Authorization: 'Bearer test', Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'named', title: 'Bulk split', recipient: '@bob', totalRaw: '300000',
        participants: [], includeOrganizer: true,
        recipients: [{ recipient: '@bob', amountRaw: '100000' }, { recipient: '@carol', amountRaw: '200000' }] }),
    })
    assert.equal(response.status, 201)
    assert.deepEqual(saved?.amounts, ['300000'])
    assert.deepEqual(saved?.payouts?.map(row => [row.recipient, row.amount]),
      [[bobWallet, '100000'], [carolWallet, '200000']])
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
