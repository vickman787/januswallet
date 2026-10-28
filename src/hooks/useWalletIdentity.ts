import { useQuery } from '@tanstack/react-query'
import { useJanusAuth } from '../auth/AccountProvider'
import { janusApi } from '../lib/api'

type WalletIdentity = { address: string; username: string; displayName: string }
type AccountIdentities = {
  profile: { username: string; display_name: string } | null
  wallets: { address: string; chain_id: number }[]
  profiles: WalletIdentity[]
}

export function useWalletIdentity(address?: string) {
  const auth = useJanusAuth()
  const normalized = address?.toLowerCase()
  return useQuery({
    queryKey: ['janus-wallet-identity', auth.subject, normalized],
    enabled: auth.authenticated && !!normalized,
    queryFn: ({ signal }) => janusApi<AccountIdentities>(auth, 'me?addresses=' + encodeURIComponent(normalized!), { signal }),
    select: data => data.profiles.find(profile => profile.address.toLowerCase() === normalized)
      ?? (data.profile && data.wallets.some(wallet => wallet.address.toLowerCase() === normalized)
        ? { address: normalized!, username: data.profile.username, displayName: data.profile.display_name }
        : null),
    staleTime: 5 * 60_000,
    retry: 1,
  })
}
