import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clearPendingPurchase, parsePurchaseDraft, parsePurchaseId, purchaseActionAvailability, purchaseRefundNotice, readPendingPurchase, savePendingPurchase, type PendingPurchaseTx, type PurchaseSnapshot } from '../src/lib/purchases'
import type { Address, Hash } from 'viem'

const organizer = '0x1111111111111111111111111111111111111111' as Address
const contributor = '0x2222222222222222222222222222222222222222' as Address
const contract = '0x3333333333333333333333333333333333333333' as Address
const token = '0x3600000000000000000000000000000000000000' as Address
const now = 1_800_000_000
const purchase: PurchaseSnapshot = {
  organizer, recipient: contributor, usdcToken: token,
  target: 10_000_000n, funded: 10_000_000n,
  fundingDeadline: now - 60, releaseDeadline: now + 60, status: 1,
}

test('purchase ID must be a full bytes32 value', () => {
  const id = '0x' + 'ab'.repeat(32)
  assert.equal(parsePurchaseId(' ' + id + ' '), id)
  assert.throws(() => parsePurchaseId('0x1234'), /32-byte/)
})

test('pending purchase recovery preserves invitation metadata and rejects malformed metadata', () => {
  const records = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  } })
  const pending: PendingPurchaseTx = {
    hash: ('0x' + 'cd'.repeat(32)) as Hash,
    kind: 'create',
    metadata: {
      title: 'Group order', description: 'Test purchase', participants: ['@alice', '@bob'],
      recipient: contributor, targetRaw: '200000', fundingDeadline: now + 120, releaseDeadline: now + 240,
    },
  }
  savePendingPurchase(organizer, pending, 5042002)
  assert.deepEqual(readPendingPurchase(organizer, 5042002), pending)
  const key = 'janus-purchase-pending:5042002:' + organizer.toLowerCase()
  records.set(key, JSON.stringify({ ...pending, metadata: { ...pending.metadata, participants: [1] } }))
  assert.equal(readPendingPurchase(organizer, 5042002), undefined)
  clearPendingPurchase(organizer, 5042002)
})
test('purchase creation requires future ordered deadlines, valid recipient and exact USDC units', () => {
  const funding = new Date((now + 120) * 1000).toISOString()
  const release = new Date((now + 240) * 1000).toISOString()
  const draft = parsePurchaseDraft(contributor, '1.000001', funding, release, contract, now * 1000)
  assert.equal(draft.amount, 1_000_001n)
  assert.equal(draft.fundingDeadline, now + 120)
  assert.throws(() => parsePurchaseDraft(contract, '1', funding, release, contract, now * 1000), /recipient/)
  assert.throws(() => parsePurchaseDraft(contributor, '1', release, funding, contract, now * 1000), /Release deadline/)
  assert.throws(() => parsePurchaseDraft(contributor, '1', funding, release, contract, (now + 120) * 1000), /Funding deadline/)
})

test('only organizer can release fully funded purchase before its deadline', () => {
  assert.equal(purchaseActionAvailability(purchase, organizer, 0n, false, now).release, true)
  assert.equal(purchaseActionAvailability(purchase, contributor, 0n, false, now).release, false)
  assert.equal(purchaseActionAvailability(purchase, organizer, 0n, false, now + 60).release, false)
  assert.equal(purchaseActionAvailability({ ...purchase, status: 0 }, organizer, 0n, false, now).release, false)
})

test('expiry and refunds follow on-chain state boundaries', () => {
  assert.equal(purchaseActionAvailability(purchase, contributor, 5n, false, now + 60).expire, true)
  assert.equal(purchaseActionAvailability({ ...purchase, status: 0 }, contributor, 5n, false, now - 60).expire, true)
  assert.equal(purchaseActionAvailability({ ...purchase, status: 3 }, contributor, 5n, false, now).refund, true)
  assert.equal(purchaseActionAvailability({ ...purchase, status: 4 }, contributor, 5n, true, now).refund, false)
  assert.equal(purchaseActionAvailability({ ...purchase, status: 2 }, contributor, 5n, false, now).refund, false)
})
test('refund inbox notice requires a cancelled or expired unclaimed contribution', () => {
  const paid = [{ amount: 200_000n, claimed: false }]
  assert.equal(purchaseRefundNotice(3, paid), 'cancelled')
  assert.equal(purchaseRefundNotice(4, paid), 'expired')
  assert.equal(purchaseRefundNotice(2, paid), null)
  assert.equal(purchaseRefundNotice(3, [{ amount: 0n, claimed: false }]), null)
  assert.equal(purchaseRefundNotice(4, [{ amount: 200_000n, claimed: true }]), null)
  assert.equal(purchaseRefundNotice(3, [{ amount: 1n, claimed: true }, { amount: 2n, claimed: false }]), 'cancelled')
})
test('purchase invitation dismissal and restore are scoped to one recipient', async () => {
  const { createProductStore } = await import('../server/products.ts')
  const original = globalThis.fetch
  const calls: { url: string; method: string; body: unknown }[] = []
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) as unknown : null,
    })
    return new Response(JSON.stringify([{ purchase_id: '11111111-1111-4111-8111-111111111111' }]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }
  try {
    const store = createProductStore('https://database.example', 'test-server-key')
    const id = '11111111-1111-4111-8111-111111111111'
    const member = '22222222-2222-4222-8222-222222222222'
    assert.equal(await store.setPurchaseInvitationStatus(id, member, 'dismissed'), true)
    assert.equal(await store.setPurchaseInvitationStatus(id, member, 'invited'), true)
    assert.equal(calls.length, 2)
    assert.ok(calls.every(call => call.method === 'PATCH' &&
      call.url.includes('purchase_id=eq.' + id) &&
      call.url.includes('profile_id=eq.' + member) &&
      call.url.includes('/purchase_participants?')))
    assert.deepEqual(calls.map(call => call.body), [{ status: 'dismissed' }, { status: 'invited' }])
  } finally { globalThis.fetch = original }
})

test('purchase invitation dismissal uses the authenticated profile', async () => {
  const { createServer } = await import('node:http')
  const { createHandler } = await import('../server/handler.ts')
  const id = '11111111-1111-4111-8111-111111111111'
  const calls: string[] = []
  const store = {
    async profile(subject: string) { return { id: subject, username: subject, display_name: subject } },
  } as import('../server/core.ts').Store
  const products = {
    async setPurchaseInvitationStatus(purchaseId: string, profileId: string, status: string) {
      calls.push(purchaseId + ':' + profileId + ':' + status)
      return true
    },
  } as import('../server/products.ts').ProductStore
  const origin = 'http://localhost:5173'
  const server = createServer(createHandler({
    origin, store, products,
    verifyToken: async header => header === 'Bearer vickman' ? 'vickman' : 'other',
    verifyWallet: async () => false,
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const endpoint = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  try {
    for (const action of ['dismiss', 'restore']) {
      const response = await fetch(endpoint + '/api/purchases/' + id + '/' + action, {
        method: 'POST',
        headers: { Origin: origin, Authorization: 'Bearer vickman', 'Content-Type': 'application/json' },
        body: '{}',
      })
      assert.equal(response.status, 200)
    }
    assert.deepEqual(calls, [id + ':vickman:dismissed', id + ':vickman:invited'])
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('purchase Activity includes only purchases organized by or invited to the account', async () => {
  const { createProductStore } = await import('../server/products.ts')
  const original = globalThis.fetch
  const profileId = '11111111-1111-4111-8111-111111111111'
  const ownedId = '22222222-2222-4222-8222-222222222222'
  const invitedId = '33333333-3333-4333-8333-333333333333'
  const row = (id: string, createdAt: string) => ({
    id, chain_id: 5042, contract_address: contract, onchain_id: '0x' + 'ab'.repeat(32),
    organizer_id: profileId, group_id: null, title: id, description: '',
    creation_tx_hash: '0x' + 'cd'.repeat(32), created_at: createdAt,
  })
  const calls: string[] = []
  globalThis.fetch = async input => {
    const url = String(input)
    calls.push(url)
    const records = url.includes('/purchases?organizer_id=eq.')
      ? [row(ownedId, '2026-10-28T10:00:00Z')]
      : url.includes('/purchase_participants?profile_id=eq.')
        ? [{ purchase_id: ownedId }, { purchase_id: invitedId }]
        : url.includes('/purchases?id=in.')
          ? [row(invitedId, '2026-10-28T11:00:00Z')]
          : []
    return new Response(JSON.stringify(records), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const activity = await createProductStore('https://database.example', 'test-server-key').purchasesFor(profileId)
    assert.deepEqual(activity.map(item => [item.purchase.id, item.role]), [
      [invitedId, 'invitee'], [ownedId, 'organizer'],
    ])
    assert.ok(calls.some(url => url.includes('organizer_id=eq.' + profileId)))
    assert.ok(calls.some(url => url.includes('profile_id=eq.' + profileId)))
    assert.ok(calls.some(url => url.includes('id=in.(' + invitedId + ')')))
  } finally { globalThis.fetch = original }
})
