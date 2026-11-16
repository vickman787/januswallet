import { formatUnits, type Address } from 'viem'
import { loadExplorerTransfers } from '../src/lib/activity.js'
import { createPushService } from './push.js'

type Subscription = { id: string; profile_id: string; created_at: string }
type Wallet = { profile_id: string; address: string }
type Marker = { created_at: string }
type SplitPayment = { split_id: string }
type Profile = { username: string }

export async function runTransferAlerts() {
  const databaseUrl = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  const origin = process.env.JANUS_ORIGIN?.trim()
  if (!databaseUrl || !key || !publicKey || !privateKey || !origin) throw new Error('Transfer alerts are not configured.')
  const databaseKey = key
  const push = createPushService(databaseUrl, databaseKey, publicKey, privateKey, origin)
  async function request<T>(path: string, method = 'GET', body?: unknown, prefer?: string): Promise<T> {
    const response = await fetch(databaseUrl + '/rest/v1/' + path, {
      method, headers: {
        apikey: databaseKey,
        ...(databaseKey.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + databaseKey }),
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error('Transfer alert database request failed: ' + response.status)
    const content = await response.text()
    return (content ? JSON.parse(content) : null) as T
  }
  const subscriptions = await request<Subscription[]>('push_subscriptions?select=id,profile_id,created_at&order=created_at.asc&limit=500')
  const firstByProfile = new Map<string, Subscription>()
  for (const subscription of subscriptions) if (!firstByProfile.has(subscription.profile_id)) firstByProfile.set(subscription.profile_id, subscription)
  const profiles = [...firstByProfile.keys()]
  if (!profiles.length) return { watched: 0, alerted: 0 }
  const wallets = await request<Wallet[]>('wallet_associations?profile_id=in.(' + profiles.join(',') + ')&chain_id=eq.5042&select=profile_id,address&limit=1000')
  let alerted = 0
  let failed = 0
  for (const wallet of wallets) {
    try {
      const subscription = firstByProfile.get(wallet.profile_id)
      if (!subscription) continue
      const address = wallet.address.toLowerCase()
      const markerKey = 'receive-watch:' + address
      const markerPath = 'push_deliveries?subscription_id=eq.' + subscription.id + '&event_key=eq.' + encodeURIComponent(markerKey) + '&select=created_at&limit=1'
      let marker = await request<Marker[]>(markerPath)
      if (!marker.length) {
        await request<Marker[]>('push_deliveries?on_conflict=subscription_id,event_key&select=created_at', 'POST',
          { subscription_id: subscription.id, event_key: markerKey }, 'resolution=ignore-duplicates,return=representation')
        marker = await request<Marker[]>(markerPath)
        if (!marker.length) continue
      }
      // The first check establishes a baseline. Existing history must never turn into new alerts.
      const cutoff = Date.parse(marker[0].created_at)
      const entries = await loadExplorerTransfers(wallet.address as Address)
      for (const entry of entries.reverse()) {
        if (entry.direction !== 'received' || !entry.timestamp || Date.parse(entry.timestamp) <= cutoff) continue
        const special = await request<SplitPayment[]>('split_participants?confirmed_tx_hash=eq.' + encodeURIComponent(entry.hash.toLowerCase()) + '&select=split_id&limit=1')
        if (special.length) continue
        const senderWallet = await request<Wallet[]>('wallet_associations?address=eq.' + encodeURIComponent(entry.from.toLowerCase()) + '&select=profile_id&limit=1')
        if (senderWallet[0]?.profile_id === wallet.profile_id) continue
        const sender = senderWallet.length
          ? await request<Profile[]>('profiles?id=eq.' + senderWallet[0].profile_id + '&select=username&limit=1')
          : []
        const label = sender.length ? '@' + sender[0].username : entry.from.slice(0, 8) + '…'
        await push.send([wallet.profile_id], {
          eventKey: 'transfer-received:' + entry.hash.toLowerCase() + ':' + address,
          title: 'USDC received',
          body: formatUnits(entry.amount, 6) + ' USDC received from ' + label + '.',
          url: '/#activity',
        })
        alerted++
      }
    } catch (error) {
      failed++
      console.error('Transfer alert scan failed for wallet', wallet.address, error)
    }
  }
  if (failed) throw new Error('Some transfer alert scans failed: ' + failed)
  return { watched: wallets.length, alerted }
}
