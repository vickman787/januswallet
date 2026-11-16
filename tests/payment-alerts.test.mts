import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHandler } from '../server/handler.ts'
import type { Store } from '../server/core.ts'
import type { ProductStore } from '../server/products.ts'
import type { PushMessage, PushService } from '../server/push.ts'

const origin = 'http://localhost:5173'
const aliceWallet = '0x1111111111111111111111111111111111111111'
const bobWallet = '0x2222222222222222222222222222222222222222'
const hash = '0x' + 'a'.repeat(64)
const purchaseId = '0x' + 'b'.repeat(64)

test('confirmed transfer and contribution alerts require verified wallet and chain proof', async () => {
  const delivered: { ids: string[]; message: PushMessage }[] = []
  const store = {
    async profile() { return { id: 'alice-id', username: 'alice', display_name: 'Alice' } },
    async wallets() { return [{ address: aliceWallet, chain_id: 5042 }] },
  } as Store
  const products = {
    async profileByWallet(wallet: string) {
      return wallet === bobWallet ? { id: 'bob-id', username: 'bob', display_name: 'Bob' } : null
    },
    async purchaseByOnchain(chainId: number, contract: string, id: string) {
      return chainId === 5042 && contract.toLowerCase() === bobWallet && id === purchaseId ? {
        id: 'purchase-id', chain_id: 5042, contract_address: bobWallet, onchain_id: purchaseId,
        organizer_id: 'bob-id', group_id: null, title: 'Group order', description: '',
        creation_tx_hash: hash, created_at: new Date().toISOString(),
      } : null
    },
  } as unknown as ProductStore
  const push = {
    async send(ids: string[], message: PushMessage) { delivered.push({ ids, message }) },
  } as PushService
  const server = createServer(createHandler({
    origin, store, products, push,
    verifyToken: async () => 'alice', verifyWallet: async () => false,
    verifyTransfer: async (txHash, from, to, amount) =>
      txHash === hash && from.toLowerCase() === aliceWallet && to.toLowerCase() === bobWallet && amount === 200_000n,
    verifyPurchaseContribution: async input =>
      input.hash === hash && input.contributor.toLowerCase() === aliceWallet &&
      input.contract.toLowerCase() === bobWallet && input.purchaseId === purchaseId ? 300_000n : null,
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  const post = (path: string, body: unknown) => fetch(base + path, {
    method: 'POST', headers: { Authorization: 'Bearer test', Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  try {
    const direct = { hash, from: aliceWallet, to: bobWallet, amountRaw: '200000' }
    assert.equal((await post('/api/transfers/confirm', direct)).status, 200)
    assert.deepEqual(delivered.map(item => [item.ids, item.message.title, item.message.url]), [
      [['alice-id'], 'USDC sent', '/#activity'],
      [['bob-id'], 'USDC received', '/#activity'],
    ])
    delivered.length = 0
    assert.equal((await post('/api/transfers/confirm', { ...direct, amountRaw: '300000' })).status, 400)
    assert.equal((await post('/api/transfers/confirm', { ...direct, from: bobWallet })).status, 403)
    assert.equal(delivered.length, 0)

    const contribution = { chainId: 5042, contract: bobWallet, purchaseId, contributor: aliceWallet, hash }
    assert.equal((await post('/api/purchases/contributions/confirm', contribution)).status, 200)
    assert.deepEqual(delivered.map(item => [item.ids, item.message.title, item.message.url]), [
      [['alice-id'], 'Purchase contribution paid', '/#purchase=5042:' + purchaseId],
      [['bob-id'], 'New purchase contribution', '/#purchase=5042:' + purchaseId],
    ])
    delivered.length = 0
    assert.equal((await post('/api/purchases/contributions/confirm', { ...contribution, hash: '0x' + 'c'.repeat(64) })).status, 400)
    assert.equal(delivered.length, 0)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('paid split share alerts the payer, organizer, and recipient only after confirmation', async () => {
  const splitId = '11111111-1111-4111-8111-111111111111'
  const delivered: { ids: string[]; message: PushMessage }[] = []
  let valid = true
  const store = {
    async profile() { return { id: 'alice-id', username: 'alice', display_name: 'Alice' } },
    async wallets() { return [{ address: aliceWallet, chain_id: 5042 }] },
  } as Store
  const products = {
    async split() {
      return {
        split: {
          id: splitId, organizer_id: 'organizer-id', recipient_address: bobWallet,
          kind: 'named', total_raw: '200000', share_count: 1, title: 'Dinner',
          description: '', chain_id: 5042, status: 'active', group_id: null, created_at: new Date().toISOString(),
        },
        shares: [{
          split_id: splitId, share_index: 0, wallet_address: aliceWallet,
          amount_raw: '200000', profile_id: 'alice-id', status: 'reserved',
          reserved_until: null, payer_address: null, confirmed_tx_hash: null,
        }],
      }
    },
    async confirmShare() { return true },
    async profileByWallet() { return { id: 'recipient-id', username: 'bob', display_name: 'Bob' } },
  } as unknown as ProductStore
  const push = {
    async send(ids: string[], message: PushMessage) { delivered.push({ ids, message }) },
  } as PushService
  const server = createServer(createHandler({
    origin, store, products, push,
    verifyToken: async () => 'alice', verifyWallet: async () => false,
    verifyTransfer: async () => valid,
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  const post = () => fetch(base + '/api/splits/' + splitId + '/shares/0/confirm', {
    method: 'POST', headers: { Authorization: 'Bearer test', Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet: aliceWallet, hash }),
  })
  try {
    valid = false
    assert.equal((await post()).status, 400)
    assert.equal(delivered.length, 0)
    valid = true
    assert.equal((await post()).status, 200)
    assert.deepEqual(delivered.map(item => [item.ids, item.message.title, item.message.url]), [
      [['alice-id'], 'Split share paid', '/#split=' + splitId],
      [['organizer-id', 'recipient-id'], 'Split share paid', '/#split=' + splitId],
    ])
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('multi-recipient split verifies each payout and completes only after the final one', async () => {
  const splitId = '22222222-2222-4222-8222-222222222222'
  const thirdWallet = '0x3333333333333333333333333333333333333333'
  const secondHash = '0x' + 'c'.repeat(64)
  const paid = new Set<number>()
  const delivered: { ids: string[]; message: PushMessage }[] = []
  const store = {
    async profile() { return { id: 'alice-id', username: 'alice', display_name: 'Alice' } },
    async wallets() { return [{ address: aliceWallet, chain_id: 5042 }] },
  } as Store
  const products = {
    async split() {
      return {
        split: { id: splitId, organizer_id: 'organizer-id', recipient_address: bobWallet,
          kind: 'named', total_raw: '300000', share_count: 1, title: 'Group payment',
          description: '', chain_id: 5042, status: 'active', group_id: null, created_at: new Date().toISOString() },
        shares: [{ split_id: splitId, share_index: 0, wallet_address: aliceWallet,
          amount_raw: '300000', profile_id: 'alice-id', status: paid.size === 2 ? 'paid' : 'reserved',
          reserved_until: null, payer_address: aliceWallet, confirmed_tx_hash: null }],
        payouts: [
          { split_id: splitId, share_index: 0, payout_index: 0, recipient_address: bobWallet, amount_raw: '100000', confirmed_tx_hash: paid.has(0) ? hash : null },
          { split_id: splitId, share_index: 0, payout_index: 1, recipient_address: thirdWallet, amount_raw: '200000', confirmed_tx_hash: paid.has(1) ? secondHash : null },
        ],
      }
    },
    async confirmPayout(_id: string, _index: number, payoutIndex: number) { paid.add(payoutIndex); return { complete: paid.size === 2 } },
    async profileByWallet(wallet: string) { return { id: wallet === bobWallet ? 'bob-id' : 'third-id', username: 'recipient', display_name: 'Recipient' } },
  } as unknown as ProductStore
  const push = { async send(ids: string[], message: PushMessage) { delivered.push({ ids, message }) } } as PushService
  const server = createServer(createHandler({
    origin, store, products, push, verifyToken: async () => 'alice', verifyWallet: async () => false,
    verifyTransfer: async (txHash, from, to, amount) => from.toLowerCase() === aliceWallet &&
      (txHash === hash && to.toLowerCase() === bobWallet && amount === 100000n ||
       txHash === secondHash && to.toLowerCase() === thirdWallet && amount === 200000n),
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  const post = (index: number, txHash: string) => fetch(base + '/api/splits/' + splitId + '/shares/0/payouts/' + index + '/confirm', {
    method: 'POST', headers: { Authorization: 'Bearer test', Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet: aliceWallet, hash: txHash }),
  })
  try {
    assert.equal((await post(1, hash)).status, 400)
    assert.equal(paid.size, 0)
    const first = await post(0, hash)
    assert.equal(first.status, 200)
    assert.deepEqual(await first.json(), { confirmed: true, complete: false })
    assert.equal((await post(0, hash)).status, 409)
    const second = await post(1, secondHash)
    assert.equal(second.status, 200)
    assert.deepEqual(await second.json(), { confirmed: true, complete: true })
    assert.equal(delivered.length, 4)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
