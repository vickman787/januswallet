import { Users, Plus } from 'lucide-react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'

export default function GroupsScreen() {
  const { isConnected } = useAccount()

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center">
        <p className="text-base mb-2" style={{ color: '#77808F' }}>Sign in to view your groups.</p>
        <p className="text-sm" style={{ color: '#4E5561' }}>Groups let you manage splits and shared purchases with a fixed set of people.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-4">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h2 className="display font-semibold text-base" style={{ color: '#F1F3F2' }}>Groups</h2>
        <button
          onClick={() => toast.info('Create group — coming soon')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
          style={{ background: 'rgba(77,107,255,0.12)', color: '#4D6BFF', border: '1px solid rgba(77,107,255,0.25)' }}
        >
          <Plus size={14} />
          New group
        </button>
      </div>

      <div className="mx-4 rounded-2xl py-16 flex flex-col items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="flex items-center justify-center w-12 h-12 rounded-full" style={{ background: 'rgba(77,107,255,0.08)', border: '1px solid rgba(77,107,255,0.15)' }}>
          <Users size={22} style={{ color: '#4D6BFF' }} />
        </span>
        <p className="text-sm font-medium" style={{ color: '#77808F' }}>No groups yet</p>
        <p className="text-xs text-center max-w-xs" style={{ color: '#4E5561' }}>
          Create a group to manage splits and shared purchases with the same people.
        </p>
        <button
          onClick={() => toast.info('Create group — coming soon')}
          className="mt-2 px-5 py-2 rounded-full text-xs font-semibold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
          style={{ background: '#4D6BFF', color: '#fff' }}
        >
          Create a group
        </button>
      </div>
    </div>
  )
}
