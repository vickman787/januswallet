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
