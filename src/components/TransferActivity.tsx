import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, usePublicClient } from 'wagmi'
import { formatUnits, type Address, type Hash } from 'viem'
import { ArrowUpRight, ArrowDownLeft, ExternalLink, RefreshCw } from 'lucide-react'
import { useJanusAuth } from '../auth/AccountProvider'
import { janusApi } from '../lib/api'
import { buildTxExplorerUrl } from '../onchain-facts'
import { ARC_MAINNET_ID, JANUS_PURCHASE_ADDRESS } from '../contracts'
import { useTransferActivity } from '../hooks/useTransferActivity'
import { isConfirmedSplitTransfer, purchaseTransferKind, transferKindLabel, type SplitProof } from '../lib/transfer-kind'

type WalletProfile = { address: string; username: string; displayName: string }
type WalletProfiles = { profiles: WalletProfile[] }
type RecordedSplit = {
  split: { recipient_address?: string }
  shares: { status: string; amount_raw: string; payer_address?: string | null; confirmed_tx_hash?: string | null }[]
}
type RecordedSplits = { splits: RecordedSplit[] }
type PurchaseTransaction = { to: Address | null; input: `0x${string}` }

function transactionTime(timestamp?: string) {
  if (!timestamp) return 'Time unavailable'
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return 'Time unavailable'
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function shortAddress(address: string) {
  return address.slice(0, 6) + '…' + address.slice(-4)
}
const validAddress = (value: unknown): value is Address => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)
const validHash = (value: unknown): value is Hash => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)

export default function TransferActivity({ compact = false }: { compact?: boolean }) {
  const auth = useJanusAuth()
  const { address } = useAccount()
  const client = usePublicClient({ chainId: ARC_MAINNET_ID })
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
    queryKey: ['janus-wallet-identities', auth.subject, address?.toLowerCase(), counterparties],
    enabled: auth.authenticated && counterparties.length > 0,
    queryFn: ({ signal }) => janusApi<WalletProfiles>(auth, 'me?addresses=' + encodeURIComponent(counterparties.join(',')), { signal }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
  })
  const splitActivity = useQuery({
    queryKey: ['janus-split-activity', auth.subject],
    enabled: auth.authenticated && !!auth.subject,
    queryFn: ({ signal }) => janusApi<RecordedSplits>(auth, 'splits', { signal }),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
  const splitProofs: SplitProof[] = (splitActivity.data?.splits ?? []).flatMap(item =>
    item.shares.flatMap(share =>
      share.status === 'paid' && validAddress(item.split.recipient_address) && validAddress(share.payer_address) &&
      validHash(share.confirmed_tx_hash) && /^\d+$/.test(share.amount_raw)
        ? [{ recipient: item.split.recipient_address, payer: share.payer_address, hash: share.confirmed_tx_hash, amount: BigInt(share.amount_raw) }]
        : [],
    ),
  )
  const escrowHashes = escrowAddress ? [...new Set(activity.entries.filter(entry =>
    entry.from.toLowerCase() === escrowAddress || entry.to.toLowerCase() === escrowAddress,
  ).map(entry => entry.hash.toLowerCase() as Hash))].slice(0, 50) : []
  const purchaseTransactions = useQuery({
    queryKey: ['janus-purchase-transfer-methods', escrowAddress, escrowHashes],
    enabled: !!client && escrowHashes.length > 0,
    queryFn: async () => {
      const found = await Promise.all(escrowHashes.map(async hash => {
        try {
          const transaction = await client!.getTransaction({ hash })
          return [hash, { to: transaction.to, input: transaction.input } satisfies PurchaseTransaction] as const
        } catch { return undefined }
      }))
      return Object.fromEntries(found.filter((item): item is NonNullable<typeof item> => !!item))
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const profileByAddress = new Map((identities.data?.profiles ?? []).map(profile => [profile.address.toLowerCase(), profile]))
  if (!address) return <p className="text-sm text-[#A8B0BE]">Connect your wallet to view activity.</p>
  const filtered = activity.entries.filter(entry => filter === 'all' || entry.direction === filter)
  const entries = compact ? filtered.slice(0, 7) : filtered

  return <div className="space-y-3">
    <div className="flex items-center gap-2 flex-wrap">
      {!compact && (['all', 'sent', 'received'] as const).map(value => <button key={value}
        className={filter === value ? 'janus-primary text-xs capitalize' : 'janus-secondary text-xs capitalize'}
        aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}
      <button onClick={() => { void activity.refetch(); void splitActivity.refetch(); if (escrowHashes.length) void purchaseTransactions.refetch(); if (counterparties.length) void identities.refetch() }} disabled={activity.isFetching}
        aria-label="Refresh activity" className="p-2 rounded-lg ml-auto disabled:opacity-50"><RefreshCw size={16} /></button>
    </div>
    {activity.isPending && <p role="status" className="text-sm text-[#A8B0BE]">Loading USDC transfers…</p>}
    {activity.isError && <p role="alert" className="janus-panel p-4 text-sm text-amber-300">Activity could not be synchronized. Refresh to retry. Existing results may be out of date.</p>}
    {!activity.isPending && !activity.isError && entries.length === 0 && <p className="janus-panel p-5 text-sm text-[#A8B0BE]">No {filter === 'all' ? '' : filter + ' '}transfers in the loaded range. Older transfers may still exist.</p>}
    {identities.isError && counterparties.length > 0 && <div role="alert" className="janus-panel p-4 text-sm text-amber-300 flex items-center justify-between gap-3">
      <span>Usernames could not be loaded.</span><button type="button" className="janus-secondary text-xs" onClick={() => void identities.refetch()}>Retry</button>
    </div>}
    <ul className="space-y-2">{entries.map(entry => {
      const received = entry.direction === 'received'
      const other = received ? entry.from : entry.to
      const profile = profileByAddress.get(other.toLowerCase())
      const isRevealed = revealed[entry.id] ?? false
      const identity = entry.direction === 'self' ? 'Your wallet'
        : profile ? '@' + profile.username
          : other.toLowerCase() === escrowAddress ? 'JANUS escrow'
            : identities.isPending ? 'Resolving username…' : shortAddress(other)
      const sign = entry.direction === 'self' ? '' : received ? '+' : '-'
      const purchaseKind = JANUS_PURCHASE_ADDRESS
        ? purchaseTransferKind(entry, purchaseTransactions.data?.[entry.hash.toLowerCase()], JANUS_PURCHASE_ADDRESS)
        : undefined
      const kind = purchaseKind ?? (isConfirmedSplitTransfer(entry, splitProofs) ? 'split' : 'transfer')
      return <li key={entry.id} className="janus-panel flex items-center gap-3 p-4">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${received ? 'bg-green-400/10 text-green-400' : 'bg-[#4D6BFF]/10 text-[#9BAEFF]'}`} aria-hidden="true">
          {received ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium">{entry.direction === 'self' ? 'To your wallet' : received ? 'Received' : 'Sent'}</span>
            <span className={`tabnum shrink-0 text-sm font-semibold ${received ? 'text-green-400' : ''}`}>{sign}{formatUnits(entry.amount, 6)} <span className="font-normal text-[#77808F]">USDC</span></span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`transfer-kind-badge ${kind !== 'transfer' ? 'transfer-kind-verified' : ''}`}>{transferKindLabel[kind]}</span>
            <time dateTime={entry.timestamp} className="text-[11px] text-[#8B99AA]">{transactionTime(entry.timestamp)}</time>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <button type="button" className="min-w-0 truncate text-left text-xs text-[#C8CDD6] underline decoration-white/20 underline-offset-4"
              aria-expanded={isRevealed} onClick={() => setRevealed(current => ({ ...current, [entry.id]: !current[entry.id] }))}>
              {identity}
            </button>
            <a className="inline-flex shrink-0 items-center gap-1 text-xs text-[#9BAEFF]" href={buildTxExplorerUrl(ARC_MAINNET_ID, entry.hash)} target="_blank" rel="noopener noreferrer">View transaction <ExternalLink size={12} /></a>
          </div>
          {isRevealed && <p className="mono text-xs text-[#A8B0BE] mt-2 break-all">{other}</p>}
        </div>
      </li>
    })}</ul>
    {!compact && activity.data && <p className="text-xs text-[#A8B0BE]">Payment types are labeled when JANUS can verify a matching Split record or Purchase contract call. Other transactions appear as USDC transfers. Select a username or shortened address to reveal the full wallet address.</p>}
  </div>
}
