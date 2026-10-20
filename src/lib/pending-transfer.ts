import { isHash, type Hash } from 'viem'
import { parseUsdcInput, paymentRecipient } from './payments.ts'

export interface PendingTransfer {
  hash: Hash
  to: `0x${string}`
  amount: string
  input: string
  account: `0x${string}`
}
const storageKey = (account: string) => `janus:pending-transfer:5042:${account.toLowerCase()}`

export function readPendingTransfer(account: string | undefined): PendingTransfer | undefined {
  if (!account) return
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(storageKey(account)) ?? 'null')
    if (!raw || typeof raw !== 'object') return
    const record = raw as Record<string, unknown>
    if (typeof record.hash !== 'string' || !isHash(record.hash) || typeof record.input !== 'string'
      || typeof record.to !== 'string' || typeof record.account !== 'string'
      || record.account.toLowerCase() !== account.toLowerCase()
      || typeof record.amount !== 'string' || BigInt(record.amount) !== parseUsdcInput(record.input)) return
    return { hash: record.hash, to: paymentRecipient(record.to), input: record.input,
      amount: record.amount, account: paymentRecipient(record.account) }
  } catch { return }
}

export function savePendingTransfer(transfer: PendingTransfer) {
  try { sessionStorage.setItem(storageKey(transfer.account), JSON.stringify(transfer)); return true }
  catch { return false }
}

export function clearPendingTransfer(account: string) {
  try { sessionStorage.removeItem(storageKey(account)) } catch { /* Private browsing can disable storage. */ }
}
