import test from 'node:test'
import assert from 'node:assert/strict'
import { toFunctionSelector, type Address, type Hash } from 'viem'
import { isConfirmedSplitTransfer, purchaseTransferKind } from '../src/lib/transfer-kind'
import type { TransferEntry } from '../src/lib/activity'

const payer = '0x1111111111111111111111111111111111111111' as Address
const recipient = '0x2222222222222222222222222222222222222222' as Address
const escrow = '0x3333333333333333333333333333333333333333' as Address
const token = '0x3600000000000000000000000000000000000000' as Address
const hash = ('0x' + 'ab'.repeat(32)) as Hash
const transfer: TransferEntry = { id: '5042:' + hash + ':0', hash, blockNumber: 100n, logIndex: 0, from: payer, to: recipient, amount: 200000n, direction: 'sent' }

const method = (signature: string) => (toFunctionSelector(signature) + '00'.repeat(64)) as `0x${string}`

test('Split label requires the exact confirmed on-chain payment', () => {
  const proof = { hash, payer, recipient, amount: 200000n }
  assert.equal(isConfirmedSplitTransfer(transfer, [proof]), true)
  assert.equal(isConfirmedSplitTransfer({ ...transfer, amount: 100000n }, [proof]), false)
  assert.equal(isConfirmedSplitTransfer({ ...transfer, to: escrow }, [proof]), false)
  assert.equal(isConfirmedSplitTransfer({ ...transfer, from: escrow }, [proof]), false)
  assert.equal(isConfirmedSplitTransfer({ ...transfer, hash: ('0x' + 'cd'.repeat(32)) as Hash }, [proof]), false)
})

test('Purchase contribution requires an escrow transfer from the purchase call', () => {
  const contribution = { ...transfer, to: escrow }
  assert.equal(purchaseTransferKind(contribution, { to: escrow, input: method('contribute(bytes32,uint256)') }, escrow), 'purchase-contribution')
  assert.equal(purchaseTransferKind(contribution, { to: token, input: method('contribute(bytes32,uint256)') }, escrow), undefined)
  assert.equal(purchaseTransferKind(transfer, { to: escrow, input: method('contribute(bytes32,uint256)') }, escrow), undefined)
  assert.equal(purchaseTransferKind(contribution, { to: escrow, input: method('createPurchase(address,uint256,uint40,uint40)') }, escrow), undefined)
})

test('Purchase release and refund are distinct incoming transfers', () => {
  const incoming = { ...transfer, from: escrow, to: payer, direction: 'received' as const }
  assert.equal(purchaseTransferKind(incoming, { to: escrow, input: method('release(bytes32)') }, escrow), 'purchase-payout')
  assert.equal(purchaseTransferKind(incoming, { to: escrow, input: method('claimRefund(bytes32)') }, escrow), 'purchase-refund')
  assert.equal(purchaseTransferKind(incoming, { to: escrow, input: method('cancel(bytes32)') }, escrow), undefined)
})
