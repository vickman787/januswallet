import { ArrowUpRight, ArrowDownLeft, RefreshCw } from 'lucide-react'
import { useAccount } from 'wagmi'

export default function ActivityScreen() {
  const { isConnected } = useAccount()

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center">
        <p className="text-base mb-2" style={{ color: '#77808F' }}>Sign in to view your activity.</p>
        <p className="text-sm" style={{ color: '#4E5561' }}>Your transactions will appear here once connected.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-4">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h2 className="display font-semibold text-base" style={{ color: '#F1F3F2' }}>Activity</h2>
        <button
          className="p-2 rounded-full transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
          aria-label="Refresh activity"
        >
          <RefreshCw size={16} style={{ color: '#77808F' }} />
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 px-4 pb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {['All', 'Sent', 'Received', 'Splits', 'Purchases'].map(f => (
          <button
            key={f}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
            style={f === 'All'
              ? { background: 'rgba(77,107,255,0.15)', color: '#4D6BFF', border: '1px solid rgba(77,107,255,0.3)' }
              : { background: 'rgba(255,255,255,0.05)', color: '#77808F', border: '1px solid rgba(255,255,255,0.08)' }
            }
          >
            {f}
          </button>
        ))}
      </div>

      {/* Empty state */}
      <div className="mx-4 rounded-2xl py-16 flex flex-col items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex -space-x-2">
          <span className="flex items-center justify-center w-10 h-10 rounded-full" style={{ background: 'rgba(77,107,255,0.10)', border: '1px solid rgba(77,107,255,0.2)' }}>
            <ArrowUpRight size={18} style={{ color: '#4D6BFF' }} />
          </span>
          <span className="flex items-center justify-center w-10 h-10 rounded-full" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <ArrowDownLeft size={18} style={{ color: '#22C55E' }} />
          </span>
        </div>
        <p className="text-sm font-medium" style={{ color: '#77808F' }}>No activity yet</p>
        <p className="text-xs text-center max-w-xs" style={{ color: '#4E5561' }}>
          Send or receive USDC, create a split, or fund a shared purchase to see your activity here.
        </p>
      </div>
    </div>
  )
}
