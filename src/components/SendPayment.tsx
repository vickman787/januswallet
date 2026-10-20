import { useState } from 'react'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { erc20Abi, type Hash } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink } from 'lucide-react'
import { buildTxExplorerUrl } from '../onchain-facts'
import { parseUsdcInput, hasExpectedTransfer } from '../lib/payments'
import { resolveRecipientInput } from '../lib/recipients'
import { ARC_MAINNET_ID } from '../contracts'
import Dialog from './Dialog'
import { ARC_USDC_ADDRESS as usdcAddress } from '../lib/network'
import { readPendingTransfer, savePendingTransfer, clearPendingTransfer } from '../lib/pending-transfer'

type Transfer = { to: `0x${string}`; amount: bigint; input: string; account: `0x${string}` }
type Stage = 'form' | 'review' | 'signing' | 'confirming' | 'confirmed' | 'unconfirmed'

export default function SendPayment({ balance, onClose }: { balance?: bigint; onClose: () => void }) {
  const { address, chainId } = useAccount()
  const client = usePublicClient({ chainId: ARC_MAINNET_ID })
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const queries = useQueryClient()
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [saved] = useState(() => readPendingTransfer(address))
  const [stage, setStage] = useState<Stage>(saved ? 'unconfirmed' : 'form')
  const [transfer, setTransfer] = useState<Transfer | undefined>(saved ? { ...saved, amount: BigInt(saved.amount) } : undefined)
  const [hash, setHash] = useState<Hash | undefined>(saved?.hash)
  const [error, setError] = useState('')
  const [resolvedName, setResolvedName] = useState('')
  const [resolving, setResolving] = useState(false)
  const busy = stage === 'signing' || stage === 'confirming'


  async function confirm(transactionHash: Hash) {
    if (!client) return
    setStage('confirming'); setError('')
    let receipt
    try {
      receipt = await client.waitForTransactionReceipt({ hash: transactionHash })
    } catch {
      setStage('unconfirmed')
      setError('Confirmation is unavailable. Check this transaction before sending again.')
      return
    }
    if (receipt.status !== 'success') {
      if (transfer) clearPendingTransfer(transfer.account)
      setStage('review'); setHash(undefined)
      setError('The transaction reverted. No successful payment was recorded.')
      return
    }
    if (!transfer || !usdcAddress || !hasExpectedTransfer(receipt.logs, usdcAddress, transfer.account, transfer.to, transfer.amount)) {
      setStage('unconfirmed')
      setError('The receipt does not contain the expected USDC transfer. Check it in the explorer; do not send again automatically.')
      return
    }
    clearPendingTransfer(transfer.account)
    setStage('confirmed')
    // Refresh errors must never turn a confirmed payment into a failure.
    void queries.invalidateQueries({ predicate: query => query.queryKey[0] === 'readContract' || query.queryKey[0] === 'usdc-activity' })
      .catch(() => { /* Queries expose their own retry states. */ })
  }

  async function review() {
    setError(''); setResolving(true)
    try {
      if (!address) throw new Error('Connect your wallet first.')
      const resolved = await resolveRecipientInput(recipient)
      const to = resolved.address
      const raw = parseUsdcInput(amount)
      if (balance === undefined) throw new Error('Refresh your balance before sending.')
      if (raw > balance) throw new Error('Insufficient USDC balance.')
      if (to.toLowerCase() === address.toLowerCase()) throw new Error('Choose a recipient other than your own wallet.')
      setResolvedName(resolved.username ? (resolved.displayName ? resolved.displayName + ' · ' : '') + resolved.username : '')
      setTransfer({ to, amount: raw, input: amount.trim(), account: address }); setStage('review')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Check the payment details.')
    } finally { setResolving(false) }
  }

  async function send() {
    if (!client || !usdcAddress || !transfer || busy || hash) return
    if (address?.toLowerCase() !== transfer.account.toLowerCase()) {
      setError('Your account changed. Review the payment again.'); setStage('form'); return
    }
    setError(''); setStage('signing')
    try {
      if (chainId !== ARC_MAINNET_ID) await switchChainAsync({ chainId: ARC_MAINNET_ID })
      await client.simulateContract({ address: usdcAddress, abi: erc20Abi, functionName: 'transfer',
        args: [transfer.to, transfer.amount], account: transfer.account })
      const transactionHash = await writeContractAsync({ address: usdcAddress, abi: erc20Abi,
        functionName: 'transfer', args: [transfer.to, transfer.amount], chainId: ARC_MAINNET_ID,
        account: transfer.account })
      savePendingTransfer({ ...transfer, amount: transfer.amount.toString(), hash: transactionHash })
      setHash(transactionHash)
      await confirm(transactionHash)
    } catch (cause) {
      setStage('review')
      const message = cause instanceof Error ? cause.message.toLowerCase() : ''
      setError(message.includes('reject') || message.includes('denied')
        ? 'You cancelled the wallet request. No successful payment was recorded.'
        : 'Unable to submit the payment. Check your network and balance, then retry.')
    }
  }

  const accountChanged = transfer && address?.toLowerCase() !== transfer.account.toLowerCase()
  return (
    <Dialog label="Send USDC" onClose={onClose} busy={busy}>
      <h2 className="display text-xl font-semibold mb-4">Send USDC</h2>
      {stage === 'form' ? <form onSubmit={event => { event.preventDefault(); void review() }} className="space-y-4">
        <label className="field-label">Recipient address or username
          <input value={recipient} onChange={event => setRecipient(event.target.value)} autoComplete="off"
            spellCheck={false} placeholder="0x… or @username" className="janus-input mono" required />
        </label>
        <label className="field-label">Amount (USDC)
          <input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal"
            placeholder="0.00" className="janus-input" required />
        </label>
        <p className="text-sm text-[#A8B0BE]">Usernames resolve only to wallets verified by JANUS.</p>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <div className="flex gap-3"><button type="button" className="janus-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="janus-primary flex-1" disabled={resolving} type="submit">{resolving ? 'Resolving…' : 'Review payment'}</button></div>
      </form> : <div className="space-y-4">
        {stage === 'confirmed' && <p role="status" className="flex gap-2 items-center text-green-400"><Check />Payment confirmed</p>}
        <dl className="space-y-3 text-sm rounded-xl border border-white/10 p-4">
          <div><dt className="text-[#A8B0BE]">Recipient</dt>{resolvedName && <dd className="mt-1">{resolvedName}</dd>}<dd className="mono break-all mt-1">{transfer?.to}</dd></div>
          <div className="flex justify-between"><dt>Amount</dt><dd>{transfer?.input} USDC</dd></div>
          <div className="flex justify-between"><dt>Network</dt><dd>Arc Mainnet</dd></div>
        </dl>
        {stage === 'review' && <p className="text-sm text-[#A8B0BE]">Funds go directly to this recipient. This transfer cannot be cancelled or refunded by JANUS. Your wallet shows the network fee before approval.</p>}
        {accountChanged && <p role="alert" className="text-amber-300">Your account changed. Close this payment and review it again.</p>}
        {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
        {busy && <p role="status">{stage === 'signing' ? 'Confirm in your wallet…' : 'Waiting for confirmation…'}</p>}
        {hash && <a className="inline-flex items-center gap-2 text-[#9BAEFF] underline py-3 break-all" href={buildTxExplorerUrl(ARC_MAINNET_ID, hash)} target="_blank" rel="noopener noreferrer">View transaction <ExternalLink size={14} /></a>}
        {stage === 'review' && <div className="flex gap-3">
          <button className="janus-secondary flex-1" onClick={() => { setStage('form'); setError('') }}>Edit</button>
          <button className="janus-primary flex-1" disabled={!!accountChanged} onClick={() => { void send() }}>Confirm payment</button>
        </div>}
        {stage === 'unconfirmed' && <p className="text-sm text-amber-300">A submitted payment needs confirmation. Check it before sending another payment.</p>}
        {stage === 'unconfirmed' && hash && <button className="janus-primary w-full" onClick={() => { void confirm(hash) }}>Check confirmation</button>}
        {!busy && <button className="janus-secondary w-full" onClick={onClose}>{stage === 'confirmed' ? 'Done' : 'Close'}</button>}
      </div>}
    </Dialog>
  )
}
