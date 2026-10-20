import { useQuery } from '@tanstack/react-query'
import { UserRound } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useJanusAuth } from '../auth/AccountProvider'
import { janusApi } from '../lib/api'
import { JanusWordmark } from './JanusLogo'

type AccountSummary = { profile: { username: string; display_name: string } | null }

export default function Header({ minimal = false, onOpenAccount, onHome }: { minimal?: boolean; onOpenAccount?: () => void; onHome?: () => void }) {
  const auth = useJanusAuth()
  const { address } = useAccount()
  const account = useQuery({
    queryKey: ['janus-account', auth.subject, address],
    enabled: !minimal && auth.ready && auth.authenticated && !!auth.subject,
    queryFn: ({ signal }) => janusApi<AccountSummary>(auth, 'me', { signal }),
    staleTime: 30_000,
    retry: false,
  })
  const label = account.data?.profile?.username ? '@' + account.data.profile.username : 'Account'

  return <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4"
    style={{ height: '60px', background: 'rgba(11,13,18,0.92)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
    <button type="button" onClick={onHome} aria-label="Go to homepage" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"><JanusWordmark size={28} /></button>
    {!minimal && <button onClick={onOpenAccount} aria-label="Account settings"
      className="flex max-w-[55vw] items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium border border-[#4D6BFF]/30 bg-[#4D6BFF]/10 text-[#C8CDD6] min-h-9 focus-visible:ring-2 focus-visible:ring-[#4D6BFF]">
      <UserRound size={15} aria-hidden="true" />
      <span className="min-w-0 truncate">{label}</span>
    </button>}
  </header>
}