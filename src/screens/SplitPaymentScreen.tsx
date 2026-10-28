import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { erc20Abi, formatUnits, type Address, type Hash } from 'viem'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { ExternalLink } from 'lucide-react'
import { useJanusAuth } from '../auth/AccountProvider'
import { ARC_MAINNET_ID } from '../contracts'
import { janusApi } from '../lib/api'
import { ARC_USDC_ADDRESS } from '../lib/network'
import { hasExpectedTransfer } from '../lib/payments'
import { useWalletIdentity } from '../hooks/useWalletIdentity'
import { buildTxExplorerUrl } from '../onchain-facts'

type Split = {
  id: string
  recipient_address: Address
  kind: 'named' | 'open'
  total_raw: string
  title: string
  description: string
  status: string
}
type Share = {
  split_id: string
  share_index: number
  wallet_address: string | null
  amount_raw: string
  status: string
}
type SplitPayload = { split: Split; shares: Share[] }

async function publicSplit(id: string, signal: AbortSignal): Promise<SplitPayload> {
  const response = await fetch('/api/splits/' + encodeURIComponent(id), { signal, cache: 'no-store' })
  const result: unknown = await response.json()
  if (!response.ok) throw new Error(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Split unavailable.')
  return result as SplitPayload
}

export default function SplitPaymentScreen({ id, onClose }: { id: string; onClose: () => void }) {
  const auth = useJanusAuth()
  const { address, chainId } = useAccount()
  const client = usePublicClient({ chainId: ARC_MAINNET_ID })
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const queries = useQueryClient()
  const split = useQuery({ queryKey: ['janus-split', id], queryFn: ({ signal }) => publicSplit(id, signal), retry: false })
  const recipientIdentity = useWalletIdentity(split.data?.split.recipient_address)
  const [busy, setBusy] = useState<number>()
  const [hash, setHash] = useState<Hash>()
  const [pendingIndex, setPendingIndex] = useState<number>()
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState<number>()

  async function recordPayment(index: number, transactionHash: Hash) {
    if (!address) throw new Error('Connect your wallet first.')
    await janusApi(auth, 'splits/' + id + '/shares/' + index + '/confirm', {
      method: 'POST',
      body: { wallet: address, hash: transactionHash },
    })
    setConfirmed(index)
    setHash(undefined)
    setPendingIndex(undefined)
    await Promise.all([
      queries.invalidateQueries({ queryKey: ['janus-split', id] }),
      queries.invalidateQueries({ queryKey: ['janus-inbox', auth.subject] }),
      queries.invalidateQueries({ queryKey: ['janus-split-activity', auth.subject] }),
    ])
  }
  async function pay(share: Share) {
    if (!address || !client || !ARC_USDC_ADDRESS) { setError('Connect your Arc wallet first.'); return }
    setBusy(share.share_index); setError(''); setConfirmed(undefined)
    try {
      await janusApi(auth, 'splits/' + id + '/shares/' + share.share_index + '/claim', {
        method: 'POST',
        body: { wallet: address },
      })
      if (chainId !== ARC_MAINNET_ID) await switchChainAsync({ chainId: ARC_MAINNET_ID })
      const amount = BigInt(share.amount_raw)
      await client.simulateContract({
        address: ARC_USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [split.data!.split.recipient_address, amount],
        account: address,
      })
      const transactionHash = await writeContractAsync({
        address: ARC_USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [split.data!.split.recipient_address, amount],
        chainId: ARC_MAINNET_ID,
        account: address,
      })
      setHash(transactionHash)
      setPendingIndex(share.share_index)
      const receipt = await client.waitForTransactionReceipt({ hash: transactionHash, timeout: 60_000 })
      if (receipt.status !== 'success' || !hasExpectedTransfer(receipt.logs, ARC_USDC_ADDRESS, address, split.data!.split.recipient_address, amount)) {
        throw new Error('The transaction did not contain the expected Arc USDC transfer. Check it in the explorer.')
      }
      await recordPayment(share.share_index, transactionHash)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to pay this share.'
      setError(message.toLowerCase().includes('reject') || message.toLowerCase().includes('denied')
        ? 'You cancelled the wallet request. No payment was recorded.'
        : message)
    } finally { setBusy(undefined) }
  }

  return <div className="p-4 space-y-4">
    <button className="text-sm text-[#9BAEFF] py-2" onClick={onClose}>← Back to wallet</button>
    {split.isPending && <p role="status">Loading split…</p>}
    {split.error && <section className="janus-panel p-5"><p role="alert">{split.error.message}</p><button className="janus-secondary mt-4" onClick={() => { void split.refetch() }}>Retry</button></section>}
    {split.data && <section className="janus-panel p-5 space-y-4">
      <div><p className="text-xs uppercase tracking-wider text-[#77808F]">{split.data.split.kind} split</p><h1 className="display text-xl font-semibold mt-1">{split.data.split.title}</h1></div>
      {split.data.split.description && <p className="text-sm text-[#A8B0BE]">{split.data.split.description}</p>}
      <dl className="text-sm space-y-2">
        <div className="flex justify-between gap-4"><dt>Total</dt><dd>{formatUnits(BigInt(split.data.split.total_raw), 6)} USDC</dd></div>
        <div><dt className="text-[#A8B0BE]">Recipient</dt><dd className="mt-1">{recipientIdentity.data?.username ? <span className="font-medium">@{recipientIdentity.data.username}</span> : <span className="mono text-xs break-all">{split.data.split.recipient_address}</span>}{recipientIdentity.data?.username && <span className="mono block text-xs break-all text-[#A8B0BE] mt-1">{split.data.split.recipient_address}</span>}</dd></div>
      </dl>
      <div className="space-y-3">
        {split.data.shares.map(share => <div className="rounded-xl border border-white/10 p-3" key={share.share_index}>
          <div className="flex items-center justify-between gap-3">
            <div><p>Share {share.share_index + 1}</p><p className="text-sm text-[#A8B0BE]">{formatUnits(BigInt(share.amount_raw), 6)} USDC · {share.status}</p></div>
            {share.status !== 'paid' && <button className="janus-primary" disabled={busy !== undefined || !!hash} onClick={() => { void pay(share) }}>{busy === share.share_index ? 'Paying…' : 'Pay share'}</button>}
            {share.status === 'paid' && <span className="text-sm text-emerald-300">Paid</span>}
          </div>
        </div>)}
      </div>
      {confirmed !== undefined && <p role="status" className="text-emerald-300">Share {confirmed + 1} is confirmed.</p>}
      {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
      {hash && <div className="space-y-3">
        <a className="inline-flex items-center gap-2 text-[#9BAEFF] underline break-all" href={buildTxExplorerUrl(ARC_MAINNET_ID, hash)} target="_blank" rel="noopener noreferrer">View submitted transaction <ExternalLink size={14} /></a>
        {pendingIndex !== undefined && <button className="janus-primary w-full" disabled={busy !== undefined} onClick={() => { setBusy(pendingIndex); setError(''); void recordPayment(pendingIndex, hash).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to confirm this payment.')).finally(() => setBusy(undefined)) }}>Retry confirmation</button>}
      </div>}
    </section>}
  </div>
}