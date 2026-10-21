import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { formatUnits } from 'viem'
import { ArrowUpRight, ArrowDownLeft, ExternalLink, RefreshCw } from 'lucide-react'
import { useJanusAuth } from '../auth/AccountProvider'
import { janusApi } from '../lib/api'
import { buildTxExplorerUrl } from '../onchain-facts'
import { ARC_MAINNET_ID, JANUS_PURCHASE_ADDRESS } from '../contracts'
import { useTransferActivity } from '../hooks/useTransferActivity'

type WalletProfile = { address: string; username: string; displayName: string }
type WalletProfiles = { profiles: WalletProfile[] }

function shortAddress(address: string) {
  return address.slice(0, 6) + '…' + address.slice(-4)
}

export default function TransferActivity({ compact = false }: { compact?: boolean }) {
  const auth = useJanusAuth()
  const { address } = useAccount()
  const activity = useTransferActivity()
  const [filter, setFilter] = useState<'all' | 'sent' | 'received'>('all')
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const escrowAddress = JANUS_PURCHASE_ADDRESS?.toLowerCase()
  const counterparties = [...new Set(activity.entries.map(entry => {
    if (entry.direction === 'self') return ''
    const other = (entry.direction === 'received' ? entry.from : entry.to).toLowerCase()
    return other === escrowAddress ? '' : other
  }).filter(Boolean))].slice(0, 50)
  const identities = useQuery({
    queryKey: ['janus-wallet-identities', counterparties],
    enabled: auth.authenticated && counterparties.length > 0,
    queryFn: ({ signal }) => janusApi<WalletProfiles>(
      auth,
      'wallets/resolve?addresses=' + encodeURIComponent(counterparties.join(',')),
      { signal },
    ),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
  })
  const profileByAddress = new Map((identities.data?.profiles ?? []).map(profile => [profile.address.toLowerCase(), profile]))
  if (!address) return <p className="text-sm text-[#A8B0BE]">Connect your wallet to view activity.</p>
  const filtered = activity.entries.filter(entry => filter === 'all' || entry.direction === filter)
  const entries = compact ? filtered.slice(0, 3) : filtered

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {!compact && (['all', 'sent', 'received'] as const).map(value => <button key={value}
          className={filter === value ? 'janus-primary text-xs capitalize' : 'janus-secondary text-xs capitalize'}
          aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}
        <button onClick={() => { void activity.refetch(); if (counterparties.length) void identities.refetch() }} disabled={activity.isFetching}
          aria-label="Refresh activity" className="p-2 rounded-lg ml-auto disabled:opacity-50"><RefreshCw size={16} /></button>
      </div>
      {activity.isPending && <p role="status" className="text-sm text-[#A8B0BE]">Loading USDC transfers…</p>}
      {activity.isError && <p role="alert" className="janus-panel p-4 text-sm text-amber-300">Activity could not be synchronized. Refresh to retry. Existing results may be out of date.</p>}
      {!activity.isPending && !activity.isError && entries.length === 0 && <p className="janus-panel p-5 text-sm text-[#A8B0BE]">No {filter === 'all' ? '' : filter + ' '}transfers in the loaded range. Older transfers may still exist.</p>}
      <ul className="space-y-2">{entries.map(entry => {
        const received = entry.direction === 'received'
        const other = received ? entry.from : entry.to
        const profile = profileByAddress.get(other.toLowerCase())
        const isRevealed = revealed[entry.id] ?? false
        const identity = entry.direction === 'self' ? 'Your wallet'
          : profile ? '@' + profile.username
            : other.toLowerCase() === escrowAddress ? 'JANUS escrow'
              : identities.isPending ? 'Resolving username&' : shortAddress(other)
        return <li key={entry.id} className="janus-panel p-4 flex gap-3 items-start">
          {received ? <ArrowDownLeft size={19} className="text-green-400 mt-1 shrink-0" /> : <ArrowUpRight size={19} className="text-[#9BAEFF] mt-1 shrink-0" />}
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><span>{entry.direction === 'self' ? 'To your wallet' : received ? 'Received' : 'Sent'}</span>
              <span className="tabnum font-medium">{formatUnits(entry.amount, 6)} USDC</span></div>
            <button type="button" className="mt-2 text-left text-[#C8CDD6] underline decoration-white/20 underline-offset-4"
              aria-expanded={isRevealed} onClick={() => setRevealed(current => ({ ...current, [entry.id]: !isRevealed }))}>
              {identity}
            </button>
            {isRevealed && <p className="mono text-xs text-[#A8B0BE] mt-2 break-all">{other}</p>}
            <div className="flex justify-end mt-3">
              <a className="inline-flex items-center gap-1 text-xs text-[#9BAEFF]" href={buildTxExplorerUrl(ARC_MAINNET_ID, entry.hash)} target="_blank" rel="noopener noreferrer">View transaction <ExternalLink size={12} /></a>
            </div>
          </div>
        </li>
      })}</ul>
      {!compact && activity.data && <p className="text-xs text-[#A8B0BE]">Showing Arc USDC transfers. Select a username or shortened address to reveal the full wallet address.</p>}

    </div>
  )
}