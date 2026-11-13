import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { erc20Abi, formatUnits, isAddress, type Hash } from 'viem'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, Check, ExternalLink } from 'lucide-react'
import { buildTxExplorerUrl } from '../onchain-facts'
import { parseUsdcInput, hasExpectedTransfer } from '../lib/payments'
import { resolveRecipientInput } from '../lib/recipients'
import { useWalletIdentity } from '../hooks/useWalletIdentity'
import { ARC_MAINNET_ID } from '../contracts'
import Dialog from './Dialog'
import RecipientScanner from './RecipientScanner'
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
  const recipientIdentity = useWalletIdentity(isAddress(recipient.trim()) ? recipient.trim() : undefined)
  const verifiedWallet = recipientIdentity.data?.address.toLowerCase() === recipient.trim().toLowerCase() ? recipientIdentity.data : null
  const [scanning, setScanning] = useState(false)
  const [amount, setAmount] = useState('')
  const [saved] = useState(() => readPendingTransfer(address))
  const [stage, setStage] = useState<Stage>(saved ? 'unconfirmed' : 'form')
  const [transfer, setTransfer] = useState<Transfer | undefined>(saved ? { ...saved, amount: BigInt(saved.amount) } : undefined)
  const [hash, setHash] = useState<Hash | undefined>(saved?.hash)
  const [error, setError] = useState('')
  const handleScannedRecipient = useCallback((scanned: `0x${string}`) => { setRecipient(scanned); setScanning(false); setError('') }, [])
  const [resolvedName, setResolvedName] = useState('')
  const [resolving, setResolving] = useState(false)
  const [feeEstimate, setFeeEstimate] = useState<string | undefined>()
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
      setFeeEstimate(undefined)
      if (usdcAddress) {
        try {
          const [gas, gasPrice] = await Promise.all([
            client?.estimateContractGas({ address: usdcAddress, abi: erc20Abi, functionName: 'transfer', args: [to, raw], account: address }),
            client?.getGasPrice(),
          ])
          if (gas !== undefined && gasPrice !== undefined) setFeeEstimate('≈ ' + formatUnits(gas * gasPrice, 6) + ' USDC')
        } catch { /* The wallet shows the final fee before signing. */ }
      }
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
  const verifiedAddressName = transfer && verifiedWallet?.address.toLowerCase() === transfer.to.toLowerCase()
    ? (verifiedWallet.displayName ? verifiedWallet.displayName + ' · ' : '') + '@' + verifiedWallet.username : ''
  const displayRecipientName = resolvedName || verifiedAddressName
  return (
    <Dialog label="Send USDC" onClose={onClose} busy={busy}>
      <div className="dialog-kicker">SEND · ARC MAINNET</div>
      <h2 className="display text-2xl font-semibold mt-2">{stage === 'form' ? 'Send USDC' : stage === 'confirmed' ? 'Payment complete' : 'Review payment'}</h2>
      <p className="mb-4 mt-1 text-sm text-[#A8B0BE]">Check the recipient and amount before signing.</p>
      {stage === 'form' ? <form onSubmit={event => { event.preventDefault(); void review() }} className="space-y-4">
        <label className="field-label">Recipient
          <input value={recipient} onChange={event => setRecipient(event.target.value)} autoComplete="off"
            spellCheck={false} placeholder="0x… or @username" className="janus-input mono" required />
        </label>
        {isAddress(recipient.trim()) && recipientIdentity.isPending && <p role="status" className="text-xs text-[#A8B0BE]">Checking for a JANUS username…</p>}
        {verifiedWallet?.username && <div className="rounded-xl border border-green-400/25 bg-green-400/5 p-3 text-sm">
          <p className="font-semibold text-green-300">Verified JANUS account: @{verifiedWallet.username}</p>
          <p className="mt-1 text-xs text-[#A8B0BE]">Payment will use the exact wallet address shown above.</p>
        </div>}
        <button type="button" className="janus-secondary inline-flex items-center gap-2 text-sm" onClick={() => { setError(''); setScanning(true) }}><Camera size={16} /> Scan wallet QR</button>
        {scanning && <RecipientScanner onScan={handleScannedRecipient} onCancel={() => setScanning(false)} />}
        <label className="field-label">Amount (USDC)
          <input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal"
            placeholder="0.00" className="janus-input" required />
        </label>
        <p className="text-sm text-[#A8B0BE]">Send USDC to any verified recipient — @username or wallet address. Usernames resolve only to wallets verified by JANUS.</p>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <div className="flex gap-3"><button type="button" className="janus-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="janus-primary flex-1" disabled={resolving} type="submit">{resolving ? 'Resolving…' : 'Review payment'}</button></div>
      </form> : <div className="space-y-4">
        {stage === 'confirmed' && <p role="status" className="flex gap-2 items-center text-green-400"><Check />Payment confirmed</p>}
        <dl className="rounded-xl border border-white/10 divide-y divide-white/[0.06]">
          <div className="p-4">
            <dt className="text-xs text-[#77808F]">Recipient</dt>
            {displayRecipientName && <dd className="mt-1 flex flex-wrap items-center gap-2 font-medium">{displayRecipientName}
              <span className="rounded-full border border-green-400/30 bg-green-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-400">Verified</span></dd>}
            <dd className="mono mt-1 break-all text-[#C8CDD6]">{transfer?.to}</dd>
          </div>
          <div className="flex items-center justify-between p-4"><dt className="text-[#A8B0BE]">Amount</dt><dd className="tabnum font-semibold">{transfer?.input} USDC</dd></div>
          <div className="flex items-center justify-between p-4"><dt className="text-[#A8B0BE]">Network</dt><dd>Arc Mainnet</dd></div>
          <div className="flex items-center justify-between p-4"><dt className="text-[#A8B0BE]">Payment type</dt><dd>Direct transfer</dd></div>
          <div className="flex items-center justify-between p-4"><dt className="text-[#A8B0BE]">Network fee</dt><dd className="tabnum">{feeEstimate ?? 'Shown by your wallet'}</dd></div>
        </dl>
        {stage === 'review' && <p className="text-sm text-[#A8B0BE]">Funds go directly to this recipient. This transfer cannot be cancelled or refunded by JANUS. Your wallet shows the network fee before approval.</p>}
        {accountChanged && <p role="alert" className="text-amber-300">Your account changed. Close this payment and review it again.</p>}
        {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
        {busy && <p role="status">{stage === 'signing' ? 'Confirm in your wallet…' : 'Waiting for confirmation…'}</p>}
        {hash && <a className="inline-flex items-center gap-2 text-[#9BAEFF] underline py-3 break-all" href={buildTxExplorerUrl(ARC_MAINNET_ID, hash)} target="_blank" rel="noopener noreferrer">View transaction <ExternalLink size={14} /></a>}
        {stage === 'review' && <div className="flex gap-3">
          <button className="janus-secondary flex-1" onClick={() => { setStage('form'); setError(''); setFeeEstimate(undefined) }}>Edit</button>
          <button className="janus-primary flex-1" disabled={!!accountChanged} onClick={() => { void send() }}>Confirm & send</button>
        </div>}
        {stage === 'unconfirmed' && <p className="text-sm text-amber-300">A submitted payment needs confirmation. Check it before sending another payment.</p>}
        {stage === 'unconfirmed' && hash && <button className="janus-primary w-full" onClick={() => { void confirm(hash) }}>Check confirmation</button>}
        {!busy && <button className="janus-secondary w-full" onClick={onClose}>{stage === 'confirmed' ? 'Done' : 'Close'}</button>}
      </div>}
    </Dialog>
  )
}
