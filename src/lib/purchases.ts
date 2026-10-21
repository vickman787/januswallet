import { isAddress, type Address, type Hash } from 'viem'
import { parseUsdcInput } from './payments.js'

export type PurchaseSnapshot = {
  organizer: Address
  recipient: Address
  usdcToken: Address
  target: bigint
  funded: bigint
  fundingDeadline: number
  releaseDeadline: number
  status: number
}

export type PurchaseInviteMetadata = {
  title: string
  description: string
  participants: string[]
  groupId?: string
  recipient: Address
  targetRaw: string
  fundingDeadline: number
  releaseDeadline: number
}
export type PendingPurchaseTx = {
  hash: Hash
  kind: string
  purchaseId?: Hash
  metadata?: PurchaseInviteMetadata
}

export function parsePurchaseId(value: string): Hash {
  const trimmed = value.trim()
  if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) throw new Error('Enter a 32-byte purchase ID.')
  return trimmed as Hash
}

export function parsePurchaseDraft(recipientInput: string, amountInput: string, fundingInput: string, releaseInput: string, contract: Address, nowMs = Date.now()) {
  const recipient = recipientInput.trim()
  if (!isAddress(recipient) || recipient.toLowerCase() === contract.toLowerCase() || /^0x0{40}$/i.test(recipient)) {
    throw new Error('Enter a valid recipient wallet address.')
  }
  const amount = parseUsdcInput(amountInput)
  const fundingDeadline = Math.floor(new Date(fundingInput).getTime() / 1000)
  const releaseDeadline = Math.floor(new Date(releaseInput).getTime() / 1000)
  if (!Number.isSafeInteger(fundingDeadline) || fundingDeadline <= Math.floor(nowMs / 1000)) throw new Error('Funding deadline must be in the future.')
  if (!Number.isSafeInteger(releaseDeadline) || releaseDeadline <= fundingDeadline || releaseDeadline > 2 ** 40 - 1) {
    throw new Error('Release deadline must be after funding closes.')
  }
  return { recipient, amount, fundingDeadline, releaseDeadline }
}

export function purchaseRefundNotice(status: number, contributions: { amount: bigint; claimed: boolean }[]) {
  if (status !== 3 && status !== 4) return null
  if (!contributions.some(item => item.amount > 0n && !item.claimed)) return null
  return status === 3 ? 'cancelled' as const : 'expired' as const
}
export function purchaseActionAvailability(purchase: PurchaseSnapshot, wallet: Address, contribution: bigint, claimed: boolean, nowSeconds = Math.floor(Date.now() / 1000)) {
  const organizer = wallet.toLowerCase() === purchase.organizer.toLowerCase()
  return {
    contribute: purchase.status === 0 && nowSeconds < purchase.fundingDeadline && purchase.funded < purchase.target,
    release: organizer && purchase.status === 1 && nowSeconds < purchase.releaseDeadline,
    cancel: organizer && (purchase.status === 0 || purchase.status === 1),
    expire: (purchase.status === 0 && nowSeconds >= purchase.fundingDeadline) || (purchase.status === 1 && nowSeconds >= purchase.releaseDeadline),
    refund: (purchase.status === 3 || purchase.status === 4) && contribution > 0n && !claimed,
  }
}

export function pendingPurchaseKey(wallet: Address, chainId = 5042) {
  return 'janus-purchase-pending:' + chainId + ':' + wallet.toLowerCase()
}

export function readPendingPurchase(wallet?: Address, chainId = 5042): PendingPurchaseTx | undefined {
  if (!wallet || typeof sessionStorage === 'undefined') return
  try {
    const raw = sessionStorage.getItem(pendingPurchaseKey(wallet, chainId))
    if (!raw) return
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return
    const value = parsed as Record<string, unknown>
    if (typeof value.hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value.hash) || typeof value.kind !== 'string') return
    if (value.purchaseId !== undefined && (typeof value.purchaseId !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value.purchaseId))) return
    let metadata: PurchaseInviteMetadata | undefined
    if (value.metadata !== undefined) {
      const row = value.metadata as Record<string, unknown>
      if (!row || typeof row !== 'object' || typeof row.title !== 'string' || typeof row.description !== 'string' ||
        !Array.isArray(row.participants) || !row.participants.every(item => typeof item === 'string') ||
        (row.groupId !== undefined && (typeof row.groupId !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.groupId))) ||
        typeof row.recipient !== 'string' || !isAddress(row.recipient) || typeof row.targetRaw !== 'string' ||
        typeof row.fundingDeadline !== 'number' || typeof row.releaseDeadline !== 'number') return
      metadata = {
        title: row.title, description: row.description, participants: row.participants,
        ...(typeof row.groupId === 'string' ? { groupId: row.groupId } : {}),
        recipient: row.recipient, targetRaw: row.targetRaw,
        fundingDeadline: row.fundingDeadline, releaseDeadline: row.releaseDeadline,
      }
    }
    return { hash: value.hash as Hash, kind: value.kind, ...(value.purchaseId ? { purchaseId: value.purchaseId as Hash } : {}), ...(metadata ? { metadata } : {}) }
  } catch { return }
}

export function savePendingPurchase(wallet: Address, pending: PendingPurchaseTx, chainId = 5042) {
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(pendingPurchaseKey(wallet, chainId), JSON.stringify(pending)) } catch { /* In-memory pending state still blocks duplicate submission. */ }
}

export function clearPendingPurchase(wallet: Address, chainId = 5042) {
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(pendingPurchaseKey(wallet, chainId)) } catch { /* Best effort storage cleanup. */ }
}