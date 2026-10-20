import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import { Inbox, RefreshCw, ShoppingBag, SplitSquareVertical, Users } from 'lucide-react'
import { useJanusAuth } from '../auth/AccountProvider'
import { janusApi } from '../lib/api'

type InboxSplit = {
  split: {
    id: string
    title: string
    description: string
    kind: 'named' | 'open'
    total_raw: string
    created_at: string
  }
  share: {
    share_index: number
    amount_raw: string
    status: string
  }
}
type GroupInvite = {
  group: { id: string; name: string; description: string; created_at: string }
  membership: { group_id: string; role: string; status: string }
}
type PurchaseInvite = {
  purchase: {
    id: string
    chain_id: number
    onchain_id: string
    title: string
    description: string
    created_at: string
  }
  status: string
  read_at: string | null
  created_at: string
}
type InboxData = {
  splits: InboxSplit[]
  groups: GroupInvite[]
  purchases: PurchaseInvite[]
  requests: unknown[]
  memberships: unknown[]
  notifications: unknown[]
}

export default function InboxScreen() {
  const auth = useJanusAuth()
  const queries = useQueryClient()
  const [responding, setResponding] = useState<string>()
  const [responseError, setResponseError] = useState('')
  const inbox = useQuery({
    queryKey: ['janus-inbox', auth.subject],
    enabled: auth.authenticated && !!auth.subject,
    queryFn: ({ signal }) => janusApi<InboxData>(auth, 'inbox', { signal }),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
  const splits = inbox.data?.splits ?? []
  const groups = inbox.data?.groups ?? []
  const purchases = inbox.data?.purchases ?? []
  async function openPurchase(item: PurchaseInvite) {
    try {
      if (!item.read_at) {
        await janusApi(auth, 'purchases/' + item.purchase.id + '/read', { method: 'POST', body: {} })
        await queries.invalidateQueries({ queryKey: ['janus-inbox', auth.subject] })
      }
    } finally {
      window.location.hash = 'purchase=' + item.purchase.chain_id + ':' + item.purchase.onchain_id
    }
  }
  async function respond(groupId: string, status: 'accepted' | 'declined') {
    setResponding(groupId); setResponseError('')
    try {
      await janusApi(auth, 'groups/' + groupId + '/respond', { method: 'POST', body: { status } })
      await Promise.all([
        queries.invalidateQueries({ queryKey: ['janus-inbox', auth.subject] }),
        queries.invalidateQueries({ queryKey: ['janus-groups', auth.subject] }),
      ])
    } catch (cause) {
      setResponseError(cause instanceof Error ? cause.message : 'Unable to respond to this invitation.')
    } finally { setResponding(undefined) }
  }

  return (
    <div className="flex flex-col pb-4">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h1 className="display font-semibold text-base text-[#F1F3F2]">Inbox</h1>
        <button onClick={() => { void inbox.refetch() }} disabled={inbox.isFetching}
          aria-label="Refresh inbox" className="p-2 rounded-lg disabled:opacity-50"><RefreshCw size={16} /></button>
      </div>

      {inbox.isPending && <p className="mx-4 janus-panel p-5 text-sm text-[#A8B0BE]" role="status">Loading your inbox…</p>}
      {inbox.error && <div className="mx-4 janus-panel p-5 text-sm text-amber-300" role="alert">
        <p>{inbox.error.message}</p>
        <button className="janus-secondary mt-4" onClick={() => { void inbox.refetch() }}>Retry</button>
      </div>}

      {!inbox.isPending && !inbox.error && splits.length === 0 && groups.length === 0 && purchases.length === 0 && <div className="mx-4 rounded-2xl py-16 flex flex-col items-center gap-3"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="flex items-center justify-center w-12 h-12 rounded-full"
          style={{ background: 'rgba(77,107,255,0.08)', border: '1px solid rgba(77,107,255,0.15)' }}>
          <Inbox size={22} className="text-[#4D6BFF]" />
        </span>
        <p className="text-sm font-medium text-[#77808F]">All caught up</p>
        <p className="text-xs text-center max-w-xs text-[#4E5561]">Pending split payments, purchase invitations and group invitations will appear here.</p>
      </div>}

      {responseError && <p className="mx-4 mb-3 text-sm text-amber-300" role="alert">{responseError}</p>}
      {groups.length > 0 && <ul className="px-4 space-y-3 mb-3">
        {groups.map(item => <li key={item.group.id} className="janus-panel p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#4D6BFF]/25 bg-[#4D6BFF]/10"><Users size={18} className="text-[#9BAEFF]" /></span>
            <div className="min-w-0 flex-1"><p className="font-semibold break-words">{item.group.name}</p><p className="mt-1 text-xs text-[#77808F]">Group invitation</p>{item.group.description && <p className="mt-3 text-sm text-[#A8B0BE] break-words">{item.group.description}</p>}
              <div className="mt-4 grid grid-cols-2 gap-2"><button className="janus-secondary" disabled={responding === item.group.id} onClick={() => { void respond(item.group.id, 'declined') }}>Decline</button><button className="janus-primary" disabled={responding === item.group.id} onClick={() => { void respond(item.group.id, 'accepted') }}>{responding === item.group.id ? 'Saving…' : 'Accept'}</button></div>
            </div>
          </div>
        </li>)}
      </ul>}

      {purchases.length > 0 && <ul className="px-4 space-y-3 mb-3">
        {purchases.map(item => <li key={item.purchase.id} className="janus-panel p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#4D6BFF]/25 bg-[#4D6BFF]/10">
              <ShoppingBag size={18} className="text-[#9BAEFF]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[#F1F3F2] break-words">{item.purchase.title}</p>
              <p className="mt-1 text-xs text-[#77808F]">Shared purchase invitation - {item.purchase.chain_id === 5042002 ? 'Arc Testnet' : 'Arc Mainnet'}</p>
              {item.purchase.description && <p className="mt-3 text-sm text-[#A8B0BE] break-words">{item.purchase.description}</p>}
              <button className="janus-primary w-full mt-4" onClick={() => { void openPurchase(item) }}>Open purchase</button>
            </div>
          </div>
        </li>)}
      </ul>}
      {splits.length > 0 && <ul className="px-4 space-y-3">
        {splits.map(item => <li key={item.split.id + ':' + item.share.share_index} className="janus-panel p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#4D6BFF]/25 bg-[#4D6BFF]/10">
              <SplitSquareVertical size={18} className="text-[#9BAEFF]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-3">
                <div><p className="font-semibold text-[#F1F3F2]">{item.split.title}</p><p className="text-xs text-[#77808F] mt-1">Named split · Share {item.share.share_index + 1} · Payment due</p></div>
                <p className="tabnum shrink-0 font-medium">{formatUnits(BigInt(item.share.amount_raw), 6)} USDC</p>
              </div>
              {item.split.description && <p className="text-sm text-[#A8B0BE] mt-3">{item.split.description}</p>}
              <button className="janus-primary w-full mt-4" onClick={() => { window.location.hash = 'split=' + item.split.id }}>Open split</button>
            </div>
          </div>
        </li>)}
      </ul>}
    </div>
  )
}
