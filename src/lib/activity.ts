import { erc20Abi, type Address, type Hash, type PublicClient } from 'viem'

export interface TransferEntry {
  id: string
  hash: Hash
  blockNumber: bigint
  logIndex: number
  from: Address
  to: Address
  amount: bigint
  direction: 'sent' | 'received' | 'self'
}

export function mergeTransfers(entries: TransferEntry[]): TransferEntry[] {
  return [...new Map(entries.map(entry => [entry.id, entry])).values()]
    .sort((a, b) => a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1)
}

/** Bounded, wallet-filtered chain reads. No API credential or database required. */
export async function loadTransferPage(client: PublicClient, token: Address, wallet: Address, end?: bigint) {
  const latest = end ?? await client.getBlockNumber({ cacheTime: 0 })
  const fromBlock = latest > 1999n ? latest - 1999n : 0n
  const base = { address: token, abi: erc20Abi, eventName: 'Transfer', fromBlock, toBlock: latest, strict: true } as const
  const [sent, received] = await Promise.all([
    client.getContractEvents({ ...base, args: { from: wallet } }),
    client.getContractEvents({ ...base, args: { to: wallet } }),
  ])
  const entries: TransferEntry[] = [...sent, ...received].flatMap(log => {
    if (log.removed || log.blockNumber === null || log.logIndex === null || !log.transactionHash) return []
    const { from, to, value } = log.args
    if (!from || !to || value === undefined) return []
    const isFrom = from.toLowerCase() === wallet.toLowerCase()
    const isTo = to.toLowerCase() === wallet.toLowerCase()
    if (!isFrom && !isTo) return []
    return [{ id: `5042:${log.transactionHash}:${log.logIndex}`, hash: log.transactionHash,
      blockNumber: log.blockNumber, logIndex: log.logIndex, from, to, amount: value,
      direction: isFrom && isTo ? 'self' : isFrom ? 'sent' : 'received' }]
  })
  return { entries: mergeTransfers(entries), fromBlock, toBlock: latest,
    nextBlock: fromBlock === 0n ? undefined : fromBlock - 1n }
}

const ARC_EXPLORER_API = 'https://explorer.arc.io/api/v2'
const ARC_USDC = '0x3600000000000000000000000000000000000000'
type JsonObject = Record<string, unknown>
function jsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Arc activity service returned invalid data.')
  return value as JsonObject
}
function jsonString(value: unknown) {
  if (typeof value !== 'string') throw new Error('Arc activity service returned invalid data.')
  return value
}
function explorerAddress(value: unknown): Address {
  const result = jsonString(jsonObject(value).hash)
  if (!/^0x[0-9a-fA-F]{40}$/.test(result)) throw new Error('Arc activity service returned an invalid address.')
  return result as Address
}

/** Complete Arc USDC history from the official browser-accessible explorer API. */
export async function loadExplorerTransfers(wallet: Address, signal?: AbortSignal) {
  const entries: TransferEntry[] = []
  let next: JsonObject | undefined
  for (let page = 0; page < 10; page++) {
    const url = new URL(ARC_EXPLORER_API + '/addresses/' + encodeURIComponent(wallet) + '/token-transfers')
    url.searchParams.set('type', 'ERC-20')
    if (next) for (const [name, value] of Object.entries(next)) {
      if (typeof value === 'string' || typeof value === 'number') url.searchParams.set(name, String(value))
    }
    const timeout = AbortSignal.timeout(10_000)
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
    if (!response.ok) throw new Error('Arc activity service is unavailable. Try again.')
    const payload = jsonObject(await response.json())
    if (!Array.isArray(payload.items)) throw new Error('Arc activity service returned invalid data.')
    for (const value of payload.items) {
      const row = jsonObject(value)
      const token = jsonObject(row.token)
      if (jsonString(token.address_hash).toLowerCase() !== ARC_USDC) continue
      const hash = jsonString(row.transaction_hash)
      const total = jsonObject(row.total)
      const amount = jsonString(total.value)
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash) || typeof row.block_number !== 'number' || typeof row.log_index !== 'number' || !/^\d+$/.test(amount)) {
        throw new Error('Arc activity service returned invalid transfer data.')
      }
      const from = explorerAddress(row.from)
      const to = explorerAddress(row.to)
      const fromWallet = from.toLowerCase() === wallet.toLowerCase()
      const toWallet = to.toLowerCase() === wallet.toLowerCase()
      if (!fromWallet && !toWallet) continue
      entries.push({
        id: `5042:${hash}:${row.log_index}`,
        hash: hash as Hash,
        blockNumber: BigInt(row.block_number),
        logIndex: row.log_index,
        from,
        to,
        amount: BigInt(amount),
        direction: fromWallet && toWallet ? 'self' : fromWallet ? 'sent' : 'received',
      })
    }
    if (payload.next_page_params === null || payload.next_page_params === undefined) break
    next = jsonObject(payload.next_page_params)
  }
  return mergeTransfers(entries).slice(0, 500)
}