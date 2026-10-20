import { useQuery } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import { RefreshCw, SplitSquareVertical } from 'lucide-react'
import { useJanusAuth } from '../auth/AccountProvider'
import { janusApi } from '../lib/api'

type ActivityShare = { share_index: number; amount_raw: string; status: string }
type ActivitySplit = {
  split: {
    id: string
    kind: 'named' | 'open'
    title: string
    description: string
    total_raw: string
    share_count: number
    status: string
    created_at: string
  }
  role: 'organizer' | 'participant'
  your_share_index: number | null
  shares: ActivityShare[]
}
type SplitActivityData = { splits: ActivitySplit[] }

export default function SplitActivity() {
  const auth = useJanusAuth()
  const activity = useQuery({
    queryKey: ['janus-split-activity', auth.subject],
    enabled: auth.authenticated && !!auth.subject,
    queryFn: ({ signal }) => janusApi<SplitActivityData>(auth, 'splits', { signal }),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
  const splits = [...(activity.data?.splits ?? [])].sort((a, b) => Date.parse(b.split.created_at) - Date.parse(a.split.created_at))

  return <section className="space-y-3">
    <div className="flex items-center justify-between">
      <h2 className="display font-semibold">Splits</h2>
      <button onClick={() => { void activity.refetch() }} disabled={activity.isFetching}
        aria-label="Refresh split activity" className="p-2 rounded-lg disabled:opacity-50"><RefreshCw size={16} /></button>
    </div>
    {activity.isPending && <p className="janus-panel p-4 text-sm text-[#A8B0BE]" role="status">Loading split activity…</p>}
    {activity.error && <div className="janus-panel p-4 text-sm text-amber-300" role="alert"><p>{activity.error.message}</p><button className="janus-secondary mt-3" onClick={() => { void activity.refetch() }}>Retry</button></div>}
    {!activity.isPending && !activity.error && splits.length === 0 && <p className="janus-panel p-4 text-sm text-[#A8B0BE]">No split activity yet.</p>}
    {splits.map(item => {
      const paid = item.shares.filter(share => share.status === 'paid').length
      const yourShare = item.shares.find(share => share.share_index === item.your_share_index)
      const payableTotal = item.shares.reduce((sum, share) => sum + BigInt(share.amount_raw), 0n)
      const organizerPortion = BigInt(item.split.total_raw) - payableTotal
      return <article key={item.split.id} className="janus-panel p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#4D6BFF]/25 bg-[#4D6BFF]/10"><SplitSquareVertical size={18} className="text-[#9BAEFF]" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-3">
              <div><h3 className="font-semibold text-[#F1F3F2]">{item.split.title}</h3><p className="mt-1 text-xs text-[#77808F]">{item.role === 'organizer' ? 'You organized' : 'You participated'} · {item.split.kind === 'named' ? 'Named split' : 'Open split'}</p></div>
              <p className="tabnum shrink-0 font-medium">{formatUnits(BigInt(item.split.total_raw), 6)} USDC</p>
            </div>
            {item.split.description && <p className="mt-3 text-sm text-[#A8B0BE]">{item.split.description}</p>}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#A8B0BE]">
              <span>{paid} of {item.shares.length} payable {item.shares.length === 1 ? 'share' : 'shares'} paid</span>
              {yourShare && <span>Your share: {formatUnits(BigInt(yourShare.amount_raw), 6)} USDC · {yourShare.status}</span>}
              {item.role === 'organizer' && organizerPortion > 0n && <span>Your included portion: {formatUnits(organizerPortion, 6)} USDC</span>}
            </div>
            <button className="janus-secondary w-full mt-4" onClick={() => { window.location.hash = 'split=' + item.split.id }}>View split</button>
          </div>
        </div>
      </article>
    })}
  </section>
}