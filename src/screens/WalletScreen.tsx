import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { useState } from 'react'
import { ArrowUpRight, ArrowDownLeft, SplitSquareVertical, ShoppingBag, RefreshCw, BookOpen, ChevronRight, Copy, Check, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Amount } from '../onchain-money'
import { ARC_MAINNET_ID, ARC_TESTNET_ID } from '../contracts'
import { getUsdc } from '../onchain-facts'
import SendPayment from '../components/SendPayment'
import WalletQR from '../components/WalletQR'
import Dialog from '../components/Dialog'
import TransferActivity from '../components/TransferActivity'
import SplitPlanner from '../components/SplitPlanner'
import SharedPurchase from '../components/SharedPurchase'
import CreateWalletActions from '../components/CreateWalletActions'

export default function WalletScreen({ onViewActivity, onOpenDocs, purchaseNetwork = 'mainnet', initialPurchaseOpen = false, initialSendOpen = false }: {
  onViewActivity: () => void
  onOpenDocs: () => void
  purchaseNetwork?: 'mainnet' | 'testnet'
  initialPurchaseOpen?: boolean
  initialSendOpen?: boolean
}) {
  const { address, chainId } = useAccount()
  const [modal, setModal] = useState<'send' | 'receive' | 'split' | 'purchase' | null>(() => initialSendOpen ? 'send' : initialPurchaseOpen ? 'purchase' : null)
  const [copied, setCopied] = useState(false)
  const targetChainId = purchaseNetwork === 'testnet' ? ARC_TESTNET_ID : ARC_MAINNET_ID
  const networkName = purchaseNetwork === 'testnet' ? 'Arc Testnet' : 'Arc Mainnet'
  const usdc = getUsdc(targetChainId)
  const usdcAddress = usdc?.address as Address | undefined

  const balance = useReadContract({ address: usdcAddress, abi: erc20Abi, functionName: 'balanceOf',
    args: address && usdc ? [address] : undefined, chainId: targetChainId,
    query: { enabled: !!address && !!usdcAddress, refetchOnWindowFocus: true, refetchInterval: 30_000 } })
  const unavailable = balance.isError || balance.data === undefined
  const shortAddress = address ? `${address.slice(0, 7)}…${address.slice(-5)}` : ''

  async function copyAddress() {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
      toast.success('Address copied')
    } catch { toast.error('Copy unavailable. Select and copy the full address below.') }
  }
  if (!address) return <div className="wallet-shell"><section className="janus-panel p-6" aria-label="Connect payment wallet">
    <h1 className="display text-2xl font-semibold">Welcome to JANUS</h1>
    <p className="text-sm text-[#A8B0BE] my-4">Your account is ready. Create a wallet to send and receive USDC on Arc, or connect an existing wallet.</p>
    <CreateWalletActions />
  </section></div>
  return <div className="wallet-shell">
    <div className="wallet-eyebrow"><span className="wallet-live-dot" aria-hidden="true" /> YOUR WALLET <span className="wallet-eyebrow-line" /></div>
    <section className="wallet-balance" aria-label="Wallet balance">
      <div className="flex items-start justify-between gap-3">
        <div><p className="wallet-balance-label">Available balance</p><p className="wallet-balance-note">USDC on {networkName}</p></div>
        <button type="button" onClick={() => { void balance.refetch() }} aria-label="Refresh balance" className="wallet-icon-button"><RefreshCw size={19} /></button>
      </div>
      {balance.isPending ? <p role="status" className="wallet-balance-status">Loading balance…</p> : unavailable
        ? <p role="status" className="wallet-balance-status text-amber-300">Balance unavailable. Refresh to retry.</p>
        : <div className="wallet-amount"><span className="tabnum">{Amount.fromRaw(balance.data, 6).toFixed(2)}</span><span className="wallet-currency">USDC</span></div>}
      <div className="wallet-balance-divider" />
      <div className="wallet-account-row">
        <div className="min-w-0"><p className="wallet-detail-label">PAYMENT WALLET</p><p className="mono truncate text-sm text-[#D5D9E1]" title={address}>{shortAddress}</p></div>
        <button type="button" onClick={() => { void copyAddress() }} className="wallet-copy-button" aria-label="Copy wallet address">{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div className="wallet-network"><span className={chainId === targetChainId ? 'wallet-live-dot' : 'wallet-warning-dot'} aria-hidden="true" />{chainId === targetChainId ? `${networkName} connected` : `Switch your wallet to ${networkName}`}</div>
      {purchaseNetwork === 'testnet' && <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-200">Contract testing mode. Purchase actions and this balance use Arc Testnet USDC. Send, Split and Activity remain Mainnet features.</p>}
    </section>

    <section aria-label="Wallet actions" className="wallet-actions">
      {([{ id: 'send', label: 'Send', Icon: ArrowUpRight }, { id: 'receive', label: 'Receive', Icon: ArrowDownLeft },
        { id: 'split', label: 'Split', Icon: SplitSquareVertical }, { id: 'purchase', label: 'Purchase', Icon: ShoppingBag }] as const).map(({ id, label, Icon }) => <button key={id} type="button" onClick={() => {
          if (purchaseNetwork === 'testnet' && id !== 'receive' && id !== 'purchase') { toast.info(`${label} remains on Arc Mainnet during contract testing.`); return }
          setModal(id)
        }} className="wallet-action"><span className="wallet-action-icon"><Icon size={22} strokeWidth={2} aria-hidden="true" /></span><span>{label}</span></button>)}
    </section>

    <button type="button" onClick={onOpenDocs} className="wallet-docs-link"><span><BookOpen size={17} /> <span><strong>Split or Purchase?</strong><small>Direct shares or escrow contributions</small></span></span><ChevronRight size={16} /></button>
    <section className="wallet-section" aria-labelledby="recent-activity-heading">
      <div className="wallet-section-heading"><h2 id="recent-activity-heading">Recent activity</h2><button type="button" onClick={onViewActivity}>View all <ChevronRight size={15} /></button></div>
      <TransferActivity compact />
    </section>

    <p className="wallet-security-note"><ShieldCheck size={15} /> Review recipients and amounts before confirming any payment.</p>

    {modal === 'send' && <SendPayment balance={balance.isError ? undefined : balance.data} onClose={() => setModal(null)} />}
    {modal === 'receive' && <Dialog label="Receive USDC" onClose={() => setModal(null)}>
      <div className="dialog-kicker">RECEIVE · {networkName.toUpperCase()}</div>
      <h2 className="display text-2xl font-semibold mt-2">Receive USDC</h2>
      <p className="mt-2 text-sm text-[#A8B0BE]">Share this address or QR code to receive USDC on {networkName}.</p>
      <WalletQR address={address} />
      <p className="mt-3 text-[10px] font-medium uppercase tracking-widest text-[#77808F]">Your {networkName} receive address</p>
      <p className="mono text-xs break-all text-center p-3 border border-white/10 rounded-xl">{address}</p>
      <p className="text-xs text-[#A8B0BE] mt-3">The QR contains your wallet address. It does not select a network automatically; ask the sender to use {networkName} USDC.</p>
      <div className="flex gap-3 mt-5"><button className="janus-secondary flex-1" onClick={() => setModal(null)}>Close</button><button className="janus-primary flex-1" onClick={() => { void copyAddress() }}>Copy address</button></div>
    </Dialog>}
    {modal === 'split' && <SplitPlanner onClose={() => setModal(null)} onOpenDocs={() => { setModal(null); onOpenDocs() }} />}
    {modal === 'purchase' && <SharedPurchase network={purchaseNetwork} onClose={() => setModal(null)} onOpenDocs={() => { setModal(null); onOpenDocs() }} />}
  </div>
}
