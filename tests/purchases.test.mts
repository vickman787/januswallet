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