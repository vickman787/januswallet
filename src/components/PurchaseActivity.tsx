import { useQuery } from '@tanstack/react-query'
import { RefreshCw, ShoppingBag } from 'lucide-react'
import { useJanusAuth } from '../auth/AccountProvider'
import { janusApi } from '../lib/api'

type ActivityPurchase = {
  purchase: {
    id: string
    chain_id: number
    onchain_id: string
    title: string
    description: string
    created_at: string
  }
  role: 'organizer' | 'invitee'
}
type PurchaseActivityData = { purchases: ActivityPurchase[] }

export default function PurchaseActivity() {
  const auth = useJanusAuth()
  const activity = useQuery({
    queryKey: ['janus-purchase-activity', auth.subject],
    enabled: auth.authenticated && !!auth.subject,
    queryFn: ({ signal }) => janusApi<PurchaseActivityData>(auth, 'purchases', { signal }),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
  const purchases = activity.data?.purchases ?? []

  return <section className="space-y-3">
    <div className="flex items-center justify-between">
      <h2 className="display font-semibold">Shared purchases</h2>
      <button type="button" onClick={() => { void activity.refetch() }} disabled={activity.isFetching}
        aria-label="Refresh purchase activity" className="p-2 rounded-lg disabled:opacity-50"><RefreshCw size={16} /></button>
    </div>
    {activity.isPending && <p className="janus-panel p-4 text-sm text-[#A8B0BE]" role="status">Loading purchase activity…</p>}
    {activity.error && <div className="janus-panel p-4 text-sm text-amber-300" role="alert">
      <p>{activity.error.message}</p>
      <button type="button" className="janus-secondary mt-3" onClick={() => { void activity.refetch() }}>Retry</button>
    </div>}
    {!activity.isPending && !activity.error && purchases.length === 0 &&
      <p className="janus-panel p-4 text-sm text-[#A8B0BE]">No shared purchase activity yet.</p>}
    {purchases.map(item => <article key={item.purchase.id} className="janus-panel p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#4D6BFF]/25 bg-[#4D6BFF]/10">
          <ShoppingBag size={18} className="text-[#9BAEFF]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[#F1F3F2] break-words">{item.purchase.title}</h3>
          <p className="mt-1 text-xs text-[#77808F]">
            {item.role === 'organizer' ? 'You organized' : 'You were invited'} · {item.purchase.chain_id === 5042002 ? 'Arc Testnet' : 'Arc Mainnet'} · {new Date(item.purchase.created_at).toLocaleString()}
          </p>
          {item.purchase.description && <p className="mt-3 text-sm text-[#A8B0BE] break-words">{item.purchase.description}</p>}
          <button type="button" className="janus-secondary w-full mt-4"
            onClick={() => { window.location.hash = 'purchase=' + item.purchase.chain_id + ':' + item.purchase.onchain_id }}>
            View purchase
          </button>
        </div>
      </div>
    </article>)}
  </section>
}
