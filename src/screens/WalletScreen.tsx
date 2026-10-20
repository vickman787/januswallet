import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { useState } from 'react'
import { ArrowUpRight, ArrowDownLeft, SplitSquareVertical, ShoppingBag, RefreshCw } from 'lucide-react'
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

export default function WalletScreen({ onViewActivity, purchaseNetwork = 'mainnet', initialPurchaseOpen = false }: {
  onViewActivity: () => void
  purchaseNetwork?: 'mainnet' | 'testnet'
  initialPurchaseOpen?: boolean
}) {
  const { address, chainId } = useAccount()
  const [modal, setModal] = useState<'send' | 'receive' | 'split' | 'purchase' | null>(() => initialPurchaseOpen ? 'purchase' : null)
  const targetChainId = purchaseNetwork === 'testnet' ? ARC_TESTNET_ID : ARC_MAINNET_ID
  const networkName = purchaseNetwork === 'testnet' ? 'Arc Testnet' : 'Arc Mainnet'
  const usdc = getUsdc(targetChainId)
  const usdcAddress = usdc?.address as Address | undefined

  const balance = useReadContract({ address: usdcAddress, abi: erc20Abi, functionName: 'balanceOf',
    args: address && usdc ? [address] : undefined, chainId: targetChainId,
    query: { enabled: !!address && !!usdcAddress, refetchOnWindowFocus: true, refetchInterval: 30_000 } })
  const unavailable = balance.isError || balance.data === undefined
  async function copyAddress() {
    if (!address) return
    try { await navigator.clipboard.writeText(address); toast.success('Address copied') }
    catch { toast.error('Copy unavailable. Select and copy the full address below.') }
  }
  if (!address) return <div className="p-4"><section className="janus-panel p-5" aria-label="Connect payment wallet">
    <h1 className="display text-xl font-semibold">Welcome to JANUS</h1>
    <p className="text-sm text-[#A8B0BE] my-4">Your account is ready. Create your Privy wallet to send and receive USDC on Arc, or connect an existing wallet. You can save your profile in Settings.</p>
    <CreateWalletActions />
  </section></div>
  return (
    <div className="space-y-5 p-4">
      <section className="janus-panel p-5" aria-label="Wallet balance">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-sm text-[#A8B0BE]">Available USDC</h1>
          <button onClick={() => { void balance.refetch() }} aria-label="Refresh balance" className="p-2 rounded-lg"><RefreshCw size={16} /></button>
        </div>
        {balance.isPending ? <p role="status">Loading balance…</p> : unavailable
          ? <p role="status" className="text-amber-300">Balance unavailable. Refresh to retry.</p>
          : <p className="display text-3xl sm:text-4xl font-semibold tabnum break-words">{Amount.fromRaw(balance.data, 6).toFixed(2)} <span className="text-base text-[#A8B0BE]">USDC</span></p>}
        <p className={`text-xs mt-4 ${chainId === targetChainId ? 'text-[#A8B0BE]' : 'text-amber-300'}`}>
          {chainId === targetChainId ? networkName : `Wallet is on another network. This view requires ${networkName}.`}
        </p>
        {purchaseNetwork === 'testnet' && <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-200">
          Contract testing mode. Purchase actions and this balance use Arc Testnet USDC. Send, Split and Activity remain Mainnet features.
        </p>}
        <button onClick={() => { void copyAddress() }} className="mono text-xs break-all text-left mt-3 text-[#C8CDD6]" aria-label="Copy wallet address">{address}</button>
      </section>
      <div className="grid grid-cols-4 gap-2">
        {([{ id: 'send', label: 'Send', Icon: ArrowUpRight }, { id: 'receive', label: 'Receive', Icon: ArrowDownLeft },
          { id: 'split', label: 'Split', Icon: SplitSquareVertical }, { id: 'purchase', label: 'Purchase', Icon: ShoppingBag }] as const).map(({ id, label, Icon }) => (
          <button key={id} onClick={() => {
            if (purchaseNetwork === 'testnet' && id !== 'receive' && id !== 'purchase') {
              toast.info(`${label} remains on Arc Mainnet during contract testing.`)
              return
            }
            setModal(id)
          }} className="janus-panel flex flex-col items-center gap-2 py-4 text-xs">
            <Icon size={20} className="text-[#9BAEFF]" />{label}
          </button>
        ))}
      </div>
      <section>
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="display font-semibold">Recent activity</h2><button className="text-sm font-medium text-[#9BAEFF] min-h-11 px-2" onClick={onViewActivity}>View all</button></div>
        <TransferActivity compact />
      </section>
      {modal === 'send' && <SendPayment balance={balance.isError ? undefined : balance.data} onClose={() => setModal(null)} />}
      {modal === 'receive' && address && <Dialog label="Receive USDC" onClose={() => setModal(null)}>
        <h2 className="display text-xl font-semibold">Receive USDC</h2>
        <p className="text-sm text-[#A8B0BE] mt-2">Send only USDC on {networkName} to this wallet.</p>
        <WalletQR address={address} />
        <p className="mono text-xs break-all text-center p-3 border border-white/10 rounded-xl">{address}</p>
        <p className="text-xs text-[#A8B0BE] mt-3">The QR encodes your wallet address. It is not a payment request or a QR that selects a network automatically.</p>
        <div className="flex gap-3 mt-5"><button className="janus-secondary flex-1" onClick={() => setModal(null)}>Close</button>
          <button className="janus-primary flex-1" onClick={() => { void copyAddress() }}>Copy address</button></div>
      </Dialog>}
      {modal === 'split' && <SplitPlanner onClose={() => setModal(null)} />}
      {modal === 'purchase' && <SharedPurchase network={purchaseNetwork} onClose={() => setModal(null)} />}
    </div>
  )
}
