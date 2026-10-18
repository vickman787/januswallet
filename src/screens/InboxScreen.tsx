import { Inbox } from 'lucide-react'
import { useAccount } from 'wagmi'

export default function InboxScreen() {
  const { isConnected } = useAccount()

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center">
        <p className="text-base mb-2" style={{ color: '#77808F' }}>Sign in to view your inbox.</p>
        <p className="text-sm" style={{ color: '#4E5561' }}>Payment requests, split invitations, and purchase updates will appear here.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-4">
      <div className="px-4 pt-4 pb-3">
        <h2 className="display font-semibold text-base" style={{ color: '#F1F3F2' }}>Inbox</h2>
      </div>

      <div className="mx-4 rounded-2xl py-16 flex flex-col items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="flex items-center justify-center w-12 h-12 rounded-full" style={{ background: 'rgba(77,107,255,0.08)', border: '1px solid rgba(77,107,255,0.15)' }}>
          <Inbox size={22} style={{ color: '#4D6BFF' }} />
        </span>
        <p className="text-sm font-medium" style={{ color: '#77808F' }}>All caught up</p>
        <p className="text-xs text-center max-w-xs" style={{ color: '#4E5561' }}>
          Payment requests, split invitations, group invitations, and refund notifications will appear here.
        </p>
      </div>
    </div>
  )
}
