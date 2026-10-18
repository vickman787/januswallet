import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { ArrowUpRight, ArrowDownLeft, SplitSquareVertical, ShoppingBag, RefreshCw, Copy, Check, ExternalLink } from 'lucide-react'
import { getUsdc, buildTxExplorerUrl } from '../onchain-facts'
import { parseAmount, usdcDecimalsFor } from '../onchain-money'
import { Amount } from '../onchain-money'
import { toast } from 'sonner'

const ARC_MAINNET_ID = 5042

function formatAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function parseOnchainError(error: unknown): string {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || msg.includes('denied')) return 'Transaction cancelled.'
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) return 'Insufficient balance.'
  if (msg.includes('reverted')) return 'Transaction failed — contract reverted.'
  if (msg.includes('network') || msg.includes('timeout')) return 'Network error. Please retry.'
  return 'Something went wrong. Please try again.'
}

type Modal = 'send' | 'receive' | null

export default function WalletScreen() {
  const { address, isConnected, chainId } = useAccount()
  const [modal, setModal] = useState<Modal>(null)
  const [copied, setCopied] = useState(false)

  const usdcFact = getUsdc(ARC_MAINNET_ID)

  const { data: rawBalance, isLoading: balLoading, refetch: refetchBal } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    chainId: ARC_MAINNET_ID,
    query: { enabled: !!address && !!usdcFact },
  })

  const formattedBal = rawBalance != null
    ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_MAINNET_ID)).toFixed(2)
    : null

  const copyAddress = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('Address copied')
  }

  const quickActions = [
    { label: 'Send',     Icon: ArrowUpRight,       id: 'send'     },
    { label: 'Receive',  Icon: ArrowDownLeft,       id: 'receive'  },
    { label: 'Split',    Icon: SplitSquareVertical, id: 'split'    },
    { label: 'Purchase', Icon: ShoppingBag,         id: 'purchase' },
  ]

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] px-6 text-center">
        <p className="text-base mb-2" style={{ color: '#77808F' }}>Connect your wallet to see your balance.</p>
        <p className="text-sm" style={{ color: '#4E5561' }}>Use the Connect button in the header.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-4">
      {/* Balance card */}
      <div
        className="mx-4 mt-4 rounded-2xl p-5"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium uppercase tracking-widest" style={{ color: '#77808F', letterSpacing: '0.1em' }}>
            USDC Balance
          </span>
          <button
            onClick={() => { void refetchBal() }}
            className="p-1.5 rounded-full transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
            aria-label="Refresh balance"
          >
            <RefreshCw size={13} style={{ color: '#77808F' }} />
          </button>
        </div>

        {balLoading ? (
          <div className="flex items-end gap-1 mt-1">
            <div className="h-10 w-40 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.07)' }} />
          </div>
        ) : formattedBal == null ? (
          <p className="mt-1 text-sm" style={{ color: '#4E5561' }}>Balance unavailable</p>
        ) : (
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className="display tabnum font-bold"
              style={{ fontSize: '2.6rem', color: '#F1F3F2', letterSpacing: '-0.03em', lineHeight: 1 }}
            >
              {formattedBal}
            </span>
            <span className="text-base font-semibold" style={{ color: '#77808F' }}>USDC</span>
          </div>
        )}

        {/* Network + address row */}
        <div className="flex items-center gap-3 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#22C55E' }} />
            <span className="text-xs" style={{ color: '#77808F' }}>
              {chainId === ARC_MAINNET_ID ? 'Arc Mainnet' : 'Wrong network'}
            </span>
          </div>
          <div className="flex-1" />
          <button
            onClick={() => { void copyAddress() }}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
            style={{ color: '#77808F', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {copied ? <Check size={12} style={{ color: '#22C55E' }} /> : <Copy size={12} />}
            <span className="mono">{address ? formatAddr(address) : ''}</span>
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2 px-4 mt-4">
        {quickActions.map(({ label, Icon, id }) => (
          <button
            key={id}
            onClick={() => {
              if (id === 'send') setModal('send')
              else if (id === 'receive') setModal('receive')
              else toast.info(`${label} — coming soon`)
            }}
            className="flex flex-col items-center gap-2 py-3 rounded-xl transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              minHeight: '72px',
            }}
          >
            <span
              className="flex items-center justify-center rounded-lg"
              style={{ width: 36, height: 36, background: 'rgba(77,107,255,0.12)' }}
            >
              <Icon size={18} style={{ color: '#4D6BFF' }} strokeWidth={1.8} />
            </span>
            <span className="text-xs font-medium" style={{ color: '#C8CDD6' }}>{label}</span>
          </button>
        ))}
      </div>

      {/* Recent activity placeholder */}
      <div className="mx-4 mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#4E5561', letterSpacing: '0.1em' }}>
          Recent activity
        </h3>
        <div
          className="rounded-xl py-8 flex flex-col items-center gap-2"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <ArrowUpRight size={24} style={{ color: '#4E5561' }} />
          <p className="text-sm" style={{ color: '#4E5561' }}>No transactions yet</p>
          <p className="text-xs" style={{ color: '#4E5561', opacity: 0.7 }}>Send or receive USDC to get started</p>
        </div>
      </div>

      {/* Modals */}
      {modal === 'send' && (
        <SendModal
          chainId={chainId}
          usdcAddress={usdcFact?.address}
          onClose={() => setModal(null)}
          onSuccess={() => { setModal(null); void refetchBal() }}
        />
      )}
      {modal === 'receive' && (
        <ReceiveModal address={address ?? ''} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

/* ── Send modal ─────────────────────────────────────────────────────── */
interface SendModalProps {
  chainId?: number
  usdcAddress?: string
  onClose: () => void
  onSuccess: () => void
}

function SendModal({ chainId, usdcAddress, onClose, onSuccess }: SendModalProps) {
  const [to, setTo]       = useState('')
  const [amount, setAmt]  = useState('')
  const [note, setNote]   = useState('')
  const [err, setErr]     = useState('')

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const isWrongChain = chainId !== ARC_MAINNET_ID
  const usdcFact = getUsdc(ARC_MAINNET_ID)

  const handleSend = () => {
    setErr('')
    if (!isAddress(to)) { setErr('Enter a valid wallet address.'); return }
    const n = parseFloat(amount)
    if (!amount || isNaN(n) || n <= 0) { setErr('Enter a valid amount.'); return }
    if (!usdcFact || !usdcAddress) { setErr('USDC unavailable on this chain.'); return }
    if (isWrongChain) { setErr('Switch to Arc Mainnet first.'); return }
    try {
      const parsed = parseAmount(ARC_MAINNET_ID, amount)
      writeContract({
        address: usdcAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to, parsed.raw],
        chainId: ARC_MAINNET_ID,
      })
    } catch {
      setErr('Invalid amount.')
    }
  }

  const displayError = err || (writeError ? parseOnchainError(writeError) : '')

  return (
    <Backdrop onClose={isSuccess ? onSuccess : onClose}>
      <h2 className="display font-semibold text-lg mb-5" style={{ color: '#F1F3F2' }}>Send USDC</h2>

      {isSuccess && hash ? (
        <div className="flex flex-col items-center gap-4 py-2">
          <span className="flex items-center justify-center rounded-full" style={{ width: 56, height: 56, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
            <Check size={28} style={{ color: '#22C55E' }} />
          </span>
          <p className="font-semibold text-base" style={{ color: '#F1F3F2' }}>Sent successfully</p>
          <a
            href={buildTxExplorerUrl(ARC_MAINNET_ID, hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF] rounded"
            style={{ color: '#4D6BFF' }}
          >
            View transaction <ExternalLink size={13} />
          </a>
          <button onClick={onSuccess} className="mt-2 px-6 py-2.5 rounded-full font-semibold text-sm" style={{ background: 'rgba(255,255,255,0.08)', color: '#C8CDD6', border: '1px solid rgba(255,255,255,0.12)' }}>
            Done
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#77808F' }}>To</label>
              <input
                type="text"
                placeholder="0x address"
                value={to}
                onChange={e => { setTo(e.target.value); setErr('') }}
                className="w-full rounded-xl px-4 py-3 text-sm mono focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#F1F3F2' }}
                disabled={isPending || isConfirming}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#77808F' }}>Amount (USDC)</label>
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => { setAmt(e.target.value); setErr('') }}
                className="w-full rounded-xl px-4 py-3 text-base tabnum font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#F1F3F2' }}
                disabled={isPending || isConfirming}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#77808F' }}>Note (optional)</label>
              <input
                type="text"
                placeholder="What's it for?"
                maxLength={80}
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#F1F3F2' }}
                disabled={isPending || isConfirming}
              />
            </div>
          </div>

          {displayError && (
            <p className="mt-3 text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              {displayError}
            </p>
          )}

          {isWrongChain && (
            <p className="mt-3 text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(245,158,11,0.08)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}>
              Switch to Arc Mainnet to send.
            </p>
          )}

          {/* Review row */}
          {to && isAddress(to) && amount && parseFloat(amount) > 0 && (
            <div className="mt-3 rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(77,107,255,0.06)', border: '1px solid rgba(77,107,255,0.15)' }}>
              <div className="flex justify-between mb-1">
                <span style={{ color: '#77808F' }}>Recipient</span>
                <span className="mono text-xs" style={{ color: '#C8CDD6' }}>{formatAddr(to)}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span style={{ color: '#77808F' }}>Amount</span>
                <span className="tabnum font-semibold" style={{ color: '#F1F3F2' }}>{amount} USDC</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#77808F' }}>Network</span>
                <span style={{ color: '#C8CDD6' }}>Arc Mainnet</span>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-5">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-full font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#C8CDD6', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={isPending || isConfirming || !to || !amount}
              className="flex-1 py-3 rounded-full font-semibold text-sm transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#4D6BFF', color: '#fff' }}
            >
              {isPending ? 'Confirm in wallet…' : isConfirming ? 'Confirming…' : 'Send'}
            </button>
          </div>
        </>
      )}
    </Backdrop>
  )
}

/* ── Receive modal ──────────────────────────────────────────────────── */
function ReceiveModal({ address, onClose }: { address: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    toast.success('Address copied')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Backdrop onClose={onClose}>
      <h2 className="display font-semibold text-lg mb-1" style={{ color: '#F1F3F2' }}>Receive USDC</h2>
      <p className="text-sm mb-5" style={{ color: '#77808F' }}>
        Only send USDC on Arc Mainnet to this address.
      </p>

      {/* QR placeholder — real QR requires a library; we show the address prominently */}
      <div
        className="flex items-center justify-center rounded-2xl mb-4"
        style={{
          background: '#fff',
          width: 180,
          height: 180,
          margin: '0 auto',
          border: '2px solid rgba(255,255,255,0.12)',
          fontSize: '11px',
          color: '#0B0D12',
          textAlign: 'center',
          padding: '12px',
          wordBreak: 'break-all',
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        <div>
          <p className="font-bold mb-1" style={{ fontSize: '10px', color: '#4D6BFF' }}>USDC · Arc</p>
          {address}
        </div>
      </div>

      <div
        className="w-full rounded-xl px-4 py-3 mb-4 mono text-xs break-all text-center"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#C8CDD6' }}
      >
        {address}
      </div>

      <p className="text-xs text-center mb-4" style={{ color: '#4E5561' }}>
        This is your wallet address for USDC on Arc Mainnet. The QR above encodes this address directly.
      </p>

      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 rounded-full font-semibold text-sm" style={{ background: 'rgba(255,255,255,0.06)', color: '#C8CDD6', border: '1px solid rgba(255,255,255,0.1)' }}>
          Close
        </button>
        <button onClick={() => { void copyAddress() }} className="flex-1 py-3 rounded-full font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-95" style={{ background: '#4D6BFF', color: '#fff' }}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied' : 'Copy address'}
        </button>
      </div>
    </Backdrop>
  )
}

/* ── Backdrop / sheet ───────────────────────────────────────────────── */
function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6"
        style={{
          background: '#141720',
          border: '1px solid rgba(255,255,255,0.1)',
          maxHeight: '90dvh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center mb-4 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>
        {children}
      </div>
    </div>
  )
}
