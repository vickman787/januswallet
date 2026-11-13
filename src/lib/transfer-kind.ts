import { toFunctionSelector, type Address, type Hash } from 'viem'
import type { TransferEntry } from './activity'

export type TransferKind = 'transfer' | 'split' | 'purchase-contribution' | 'purchase-payout' | 'purchase-refund'

export type SplitProof = {
  recipient: Address
  payer: Address
  amount: bigint
  hash: Hash
}

const purchaseMethods = {
  contribute: toFunctionSelector('contribute(bytes32,uint256)'),
  release: toFunctionSelector('release(bytes32)'),
  claimRefund: toFunctionSelector('claimRefund(bytes32)'),
}

/** A confirmed share is matched to its exact USDC Transfer log, not merely its transaction hash. */
export function isConfirmedSplitTransfer(entry: TransferEntry, proofs: SplitProof[]) {
  return proofs.some(proof =>
    proof.hash.toLowerCase() === entry.hash.toLowerCase() &&
    proof.payer.toLowerCase() === entry.from.toLowerCase() &&
    proof.recipient.toLowerCase() === entry.to.toLowerCase() &&
    proof.amount === entry.amount,
  )
}

/** Purchase labels require a call to our configured contract and a transfer across its escrow boundary. */
export function purchaseTransferKind(
  entry: TransferEntry,
  transaction: { to: Address | null; input: `0x${string}` } | undefined,
  contract: Address,
): TransferKind | undefined {
  const escrow = contract.toLowerCase()
  if (!transaction || transaction.to?.toLowerCase() !== escrow) return undefined
  const input = transaction.input.toLowerCase()
  if (entry.to.toLowerCase() === escrow && input.startsWith(purchaseMethods.contribute)) return 'purchase-contribution'
  if (entry.from.toLowerCase() === escrow && input.startsWith(purchaseMethods.release)) return 'purchase-payout'
  if (entry.from.toLowerCase() === escrow && input.startsWith(purchaseMethods.claimRefund)) return 'purchase-refund'
  return undefined
}

export const transferKindLabel: Record<TransferKind, string> = {
  transfer: 'USDC transfer',
  split: 'Split payment',
  'purchase-contribution': 'Purchase contribution',
  'purchase-payout': 'Purchase payout',
  'purchase-refund': 'Purchase refund',
}
