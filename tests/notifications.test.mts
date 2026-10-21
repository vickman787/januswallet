import test from 'node:test'
import assert from 'node:assert/strict'
import { purchaseRefundNotificationPlan, type ProductNotification } from '../server/products.ts'

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
  const plan = purchaseRefundNotificationPlan([{ purchaseId, reason: 'cancelled' }], [existing])
  assert.deepEqual(plan, { stale: [], missing: [] })
})

test('refund notification reconciliation removes claimed alerts and replaces changed reasons', () => {
  const claimed = purchaseRefundNotificationPlan([{ purchaseId, reason: null }], [existing])
  assert.deepEqual(claimed.stale, [existing])
  assert.deepEqual(claimed.missing, [])

  const expired = purchaseRefundNotificationPlan([{ purchaseId, reason: 'expired' }], [existing])
  assert.deepEqual(expired.stale, [existing])
  assert.deepEqual(expired.missing, [{ purchaseId, reason: 'expired' }])
})