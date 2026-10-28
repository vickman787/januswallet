import test from 'node:test'
import assert from 'node:assert/strict'
import { purchaseNoticeKind, purchaseNotificationPlan, type ProductNotification } from '../server/products.ts'

const purchaseId = '11111111-1111-4111-8111-111111111111'
const existing: ProductNotification = {
  id: '22222222-2222-4222-8222-222222222222',
  recipient_id: '33333333-3333-4333-8333-333333333333',
  event_key: 'purchase-refund:' + purchaseId,
  kind: 'purchase_refund_cancelled',
  resource_id: purchaseId,
  read_at: '2026-10-21T00:00:00.000Z',
  created_at: '2026-10-21T00:00:00.000Z',
}

test('refund notification reconciliation preserves read alerts and does not duplicate them', () => {
  const plan = purchaseNotificationPlan([{ purchaseId, kind: 'purchase_refund_cancelled' }], [existing])
  assert.deepEqual(plan, { stale: [], missing: [] })
})

test('refund notification reconciliation removes claimed alerts and replaces changed reasons', () => {
  const claimed = purchaseNotificationPlan([{ purchaseId, kind: null }], [existing])
  assert.deepEqual(claimed.stale, [existing])
  assert.deepEqual(claimed.missing, [])

  const expired = purchaseNotificationPlan([{ purchaseId, kind: 'purchase_refund_expired' }], [existing])
  assert.deepEqual(expired.stale, [existing])
  assert.deepEqual(expired.missing, [{ purchaseId, kind: 'purchase_refund_expired' }])
})

test('participant reminders advance from 24 hours to one hour and stop after contribution', () => {
  const base = {
    role: 'participant' as const, status: 0, target: 200_000n, funded: 0n,
    fundingDeadline: 100_000, releaseDeadline: 200_000, contribution: 0n,
    refundClaimed: false,
  }
  assert.equal(purchaseNoticeKind({ ...base, now: 100_000 - 25 * 60 * 60 }), null)
  assert.equal(purchaseNoticeKind({ ...base, now: 100_000 - 24 * 60 * 60 }), 'purchase_funding_24h')
  assert.equal(purchaseNoticeKind({ ...base, now: 100_000 - 60 * 60 }), 'purchase_funding_1h')
  assert.equal(purchaseNoticeKind({ ...base, now: 100_000 - 30 * 60, contribution: 1n }), null)
  assert.equal(purchaseNoticeKind({ ...base, now: 100_000 }), null)
})

test('organizer sees funded and release-deadline alerts until settlement', () => {
  const base = {
    role: 'organizer' as const, status: 1, target: 200_000n, funded: 200_000n,
    fundingDeadline: 50_000, releaseDeadline: 200_000, contribution: 0n,
    refundClaimed: false,
  }
  assert.equal(purchaseNoticeKind({ ...base, now: 100_000 }), 'purchase_fully_funded')
  assert.equal(purchaseNoticeKind({ ...base, now: 200_000 - 24 * 60 * 60 }), 'purchase_release_24h')
  assert.equal(purchaseNoticeKind({ ...base, now: 200_000 - 60 * 60 }), 'purchase_release_1h')
  assert.equal(purchaseNoticeKind({ ...base, now: 200_000 }), null)
  assert.equal(purchaseNoticeKind({ ...base, status: 2, now: 100_000 }), null)
})

test('refund alerts take priority for contributors and disappear after claim', () => {
  const base = {
    role: 'participant' as const, status: 3, target: 200_000n, funded: 100_000n,
    fundingDeadline: 50_000, releaseDeadline: 100_000, contribution: 100_000n,
    refundClaimed: false, now: 60_000,
  }
  assert.equal(purchaseNoticeKind(base), 'purchase_refund_cancelled')
  assert.equal(purchaseNoticeKind({ ...base, status: 4 }), 'purchase_refund_expired')
  assert.equal(purchaseNoticeKind({ ...base, refundClaimed: true }), null)
})

test('completed purchases leave Inbox, while active and refundable purchases stay visible', async () => {
  const { purchaseInboxComplete } = await import('../server/products.ts')
  const base = { role: 'participant' as const, outstandingContribution: 0n, hasVerifiedWallet: true }
  assert.equal(purchaseInboxComplete({ ...base, status: 2 }), true)
  assert.equal(purchaseInboxComplete({ ...base, status: 4 }), true)
  assert.equal(purchaseInboxComplete({ ...base, status: 3, outstandingContribution: 1n }), false)
  assert.equal(purchaseInboxComplete({ ...base, status: 4, hasVerifiedWallet: false }), false)
  assert.equal(purchaseInboxComplete({ ...base, status: 0 }), false)
  assert.equal(purchaseInboxComplete({ ...base, status: 1 }), false)
  assert.equal(purchaseInboxComplete({ ...base, status: 4, role: 'organizer' }), true)
})

test('Inbox API filters terminal invitations only after on-chain reconciliation', async () => {
  const { createServer } = await import('node:http')
  const { createHandler } = await import('../server/handler.ts')
  const completedId = '11111111-1111-4111-8111-111111111111'
  const activeId = '22222222-2222-4222-8222-222222222222'
  const store = {
    async profile() { return { id: 'profile', username: 'vickman', display_name: 'Vickman' } },
    async wallets() { return [] },
  } as import('../server/core.ts').Store
  const products = {
    async inbox() {
      const purchases = [completedId, activeId].map(id => ({
        purchase: { id }, status: 'invited', read_at: '2026-10-28T00:00:00Z', created_at: '2026-10-28T00:00:00Z',
      }))
      return {
        requests: [], memberships: [], notifications: [], splits: [], groups: [],
        groupJoinNotices: [], purchases, notificationPurchases: purchases.map(item => item.purchase),
      }
    },
    async syncPurchaseNotifications() { return [] },
  } as unknown as import('../server/products.ts').ProductStore
  const server = createServer(createHandler({
    origin: 'http://localhost:5173', store, products,
    verifyToken: async () => 'subject', verifyWallet: async () => false,
    purchaseNoticeStates: async () => [
      { purchaseId: completedId, kind: null, terminal: true },
      { purchaseId: activeId, kind: null, terminal: false },
    ],
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const endpoint = 'http://127.0.0.1:' + (server.address() as { port: number }).port
    const response = await fetch(endpoint + '/api/inbox', {
      headers: { Authorization: 'Bearer test', Origin: 'http://localhost:5173' },
    })
    assert.equal(response.status, 200)
    const body = await response.json() as { purchases: { purchase: { id: string } }[] }
    assert.deepEqual(body.purchases.map(item => item.purchase.id), [activeId])
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
