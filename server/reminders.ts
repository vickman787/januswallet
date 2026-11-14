import { createPublicClient, http, type Address, type Hash } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { createPushService } from './push.js'

const abi = [{
  type: 'function', name: 'getPurchase', stateMutability: 'view',
  inputs: [{ name: 'purchaseId', type: 'bytes32' }],
  outputs: [
    { name: 'organizer', type: 'address' }, { name: 'recipient', type: 'address' },
    { name: 'usdcToken', type: 'address' }, { name: 'targetAmount', type: 'uint256' },
    { name: 'totalContributed', type: 'uint256' }, { name: 'fundingDeadline', type: 'uint40' },
    { name: 'releaseDeadline', type: 'uint40' }, { name: 'status', type: 'uint8' },
  ],
}, {
  type: 'function', name: 'contributionOf', stateMutability: 'view',
  inputs: [{ name: 'purchaseId', type: 'bytes32' }, { name: 'contributor', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}] as const

type Purchase = {
  id: string; chain_id: number; contract_address: string; onchain_id: string
  title: string; organizer_id: string; funding_deadline: number | null; release_deadline: number | null
}
type Participant = { profile_id: string }
type Wallet = { profile_id: string; address: string }

export function deadlineReminderKind(status: number, target: bigint, funded: bigint, fundingDeadline: number,
  releaseDeadline: number, now: number): 'funding_24h' | 'funding_1h' | 'release_24h' | 'release_1h' | null {
  const remaining = status === 0 && funded < target ? fundingDeadline - now : status === 1 ? releaseDeadline - now : 0
  if (remaining <= 0 || remaining > 86400) return null
  const stage = status === 0 ? 'funding' : 'release'
  return `${stage}_${remaining <= 3600 ? '1h' : '24h'}`
}

export async function runPurchaseDeadlineReminders() {
  const databaseUrl = process.env.SUPABASE_URL?.trim()
  const databaseKey = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const origin = process.env.JANUS_ORIGIN?.trim()
  if (!databaseUrl || !databaseKey || !publicKey || !privateKey || !origin) throw new Error('Reminder service is not configured.')
  const push = createPushService(databaseUrl, databaseKey, publicKey, privateKey, origin)
  const now = Math.floor(Date.now() / 1000)
  const key = databaseKey
  async function read<T>(path: string): Promise<T> {
    const response = await fetch(`${databaseUrl}/rest/v1/${path}`, {
      headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }) },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`Reminder database read failed: ${response.status}`)
    return await response.json() as T
  }
  const mainnetClient = createPublicClient({ chain: arc, transport: http(undefined, { timeout: 10000, retryCount: 1 }) })
  const testnetClient = createPublicClient({ chain: arcTestnet, transport: http(undefined, { timeout: 10000, retryCount: 1 }) })
  // Older purchases predate indexed deadline columns. Recover a small batch from chain each run.
  const legacy = await read<Purchase[]>('purchases?funding_deadline=is.null&select=id,chain_id,contract_address,onchain_id,title,organizer_id,funding_deadline,release_deadline&order=created_at.desc&limit=10')
  for (const item of legacy) {
    try {
      const expected = item.chain_id === 5042002 ? '0xbcae6c22c0c3c2509f920613a4900065bfe00442' :
        item.chain_id === 5042 ? process.env.JANUS_PURCHASE_ADDRESS?.trim().toLowerCase() : undefined
      if (!expected || item.contract_address.toLowerCase() !== expected) continue
      const client = item.chain_id === 5042002 ? testnetClient : mainnetClient
      const state = await client.readContract({ address: item.contract_address as Address, abi, functionName: 'getPurchase', args: [item.onchain_id as Hash] })
      const response = await fetch(`${databaseUrl}/rest/v1/purchases?id=eq.${item.id}`, {
        method: 'PATCH',
        headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json' },
        body: JSON.stringify({ funding_deadline: Number(state[5]), release_deadline: Number(state[6]) }),
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) throw new Error(`Legacy deadline backfill failed: ${response.status}`)
    } catch (error) { console.error('Legacy purchase deadline backfill failed for', item.id, error) }
  }
  const base = 'purchases?select=id,chain_id,contract_address,onchain_id,title,organizer_id,funding_deadline,release_deadline&order=created_at.desc&limit=1000&'
  const [funding, release] = await Promise.all([
    read<Purchase[]>(base + `funding_deadline=gt.${now}&funding_deadline=lte.${now + 86400}`),
    read<Purchase[]>(base + `release_deadline=gt.${now}&release_deadline=lte.${now + 86400}`),
  ])
  const candidates = [...new Map([...funding, ...release].map(item => [item.id, item])).values()]

  let sent = 0

  let failed = 0
  for (const purchase of candidates) {
    try {
      const expected = purchase.chain_id === 5042002 ? '0xbcae6c22c0c3c2509f920613a4900065bfe00442' :
        purchase.chain_id === 5042 ? process.env.JANUS_PURCHASE_ADDRESS?.trim().toLowerCase() : undefined
      if (!expected || purchase.contract_address.toLowerCase() !== expected) continue
      const client = purchase.chain_id === 5042002 ? testnetClient : mainnetClient
      const address = purchase.contract_address as Address
      const purchaseId = purchase.onchain_id as Hash
      const state = await client.readContract({ address, abi, functionName: 'getPurchase', args: [purchaseId] })
      const kind = deadlineReminderKind(Number(state[7]), BigInt(state[3]), BigInt(state[4]), Number(state[5]), Number(state[6]), now)
      if (!kind || Number(state[5]) !== purchase.funding_deadline || Number(state[6]) !== purchase.release_deadline) continue
      const url = `/#purchase=${purchase.chain_id}:${purchase.onchain_id}`
      if (kind.startsWith('release')) {
        await push.send([purchase.organizer_id], {
          eventKey: `purchase-deadline:${purchase.id}:${kind}`,
          title: kind.endsWith('1h') ? 'Purchase release deadline in 1 hour' : 'Purchase release deadline within 24 hours',
          body: `${purchase.title} is funded and ready for release.`, url, ttlSeconds: Math.min(3600, Number(state[6]) - now),
        })
        sent++
        continue
      }
      const participants = await read<Participant[]>(`purchase_participants?purchase_id=eq.${purchase.id}&status=eq.invited&select=profile_id`)
      if (!participants.length) continue
      const ids = participants.map(item => item.profile_id)
      const wallets = await read<Wallet[]>(`wallet_associations?profile_id=in.(${ids.join(',')})&chain_id=eq.5042&select=profile_id,address`)
      const contributed = await Promise.all(wallets.map(async wallet => ({
        id: wallet.profile_id,
        amount: await client.readContract({ address, abi, functionName: 'contributionOf', args: [purchaseId, wallet.address as Address] }),
      })))
      const paid = new Set(contributed.filter(item => item.amount > 0n).map(item => item.id))
      const unpaid = ids.filter(id => !paid.has(id))
      if (unpaid.length) {
        await push.send(unpaid, {
          eventKey: `purchase-deadline:${purchase.id}:${kind}`,
          title: kind.endsWith('1h') ? 'Purchase funding deadline in 1 hour' : 'Purchase funding deadline within 24 hours',
          body: `${purchase.title} still needs contributions.`, url, ttlSeconds: Math.min(3600, Number(state[5]) - now),
        })
        sent += unpaid.length
      }
    } catch (error) {
      failed++
      console.error('Purchase reminder failed for', purchase.id, error)
    }
  }
  return { checked: candidates.length, recipients: sent, failed }
}
