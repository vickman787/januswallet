import { useJanusAuth } from './auth/AccountProvider'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import BottomNav, { type Screen } from './components/BottomNav'
import Header from './components/Header'
import LandingScreen from './screens/LandingScreen'
import WalletScreen from './screens/WalletScreen'
import ActivityScreen from './screens/ActivityScreen'
import InboxScreen from './screens/InboxScreen'
import GroupsScreen from './screens/GroupsScreen'
import SettingsScreen from './screens/SettingsScreen'
import DocsScreen from './screens/DocsScreen'
import SplitPaymentScreen from './screens/SplitPaymentScreen'
import AppLoadingScreen from './components/AppLoadingScreen'
import ContractDeploymentScreen from './screens/ContractDeploymentScreen'
import SharedPurchase from './components/SharedPurchase'
import { janusApi } from './lib/api'
import type { Hash } from 'viem'

type InboxCountData = {
  splits: unknown[]
  groups: unknown[]
  purchases: { purchase: { id: string }; status: string; read_at: string | null }[]
  notifications: { kind: string; resource_id: string | null; read_at: string | null }[]
}

export default function App() {
  const { address } = useAccount()
  const { subject } = useJanusAuth()
  return <AccountApp key={subject + (address?.toLowerCase() ?? 'signed-out')} />
}

function splitFromHash() {
  const match = /^#split=([0-9a-f-]{36})$/i.exec(window.location.hash)
  return match?.[1]
}
function purchaseFromHash(): { chainId: 5042 | 5042002; id: Hash } | undefined {
  const match = /^#purchase=(5042|5042002):(0x[0-9a-f]{64})$/i.exec(window.location.hash)
  return match ? { chainId: Number(match[1]) as 5042 | 5042002, id: match[2] as Hash } : undefined
}

function AccountApp() {
  const auth = useJanusAuth()
  const { authenticated, ready } = auth
  const [screen, setScreen] = useState<Screen>(() => window.location.hash === '#inbox' ? 'inbox' : window.location.hash === '#activity' ? 'activity' : 'home')
  const [showLanding, setShowLanding] = useState(false)
  const [sendIntent, setSendIntent] = useState(0)
  const [splitId, setSplitId] = useState(splitFromHash)
  const [purchaseRoute, setPurchaseRoute] = useState(purchaseFromHash)
  const inbox = useQuery({
    queryKey: ['janus-inbox', auth.subject],
    enabled: auth.authenticated && !!auth.subject,
    queryFn: ({ signal }) => janusApi<InboxCountData>(auth, 'inbox', { signal }),
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
  useEffect(() => {
    const changed = () => { setSplitId(splitFromHash()); setPurchaseRoute(purchaseFromHash()); if (window.location.hash === '#inbox') setScreen('inbox'); if (window.location.hash === '#activity') setScreen('activity') }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])
  function leaveSplit(next: Screen) {
    history.replaceState(null, '', window.location.pathname + window.location.search)
    setSplitId(undefined)
    setScreen(next)
  }
  function openLanding() {
    history.replaceState(null, '', window.location.pathname + window.location.search)
    setSplitId(undefined)
    setPurchaseRoute(undefined)
    setSendIntent(0)
    setShowLanding(true)
  }
  function changeScreen(next: Screen) {
    if (window.location.hash === '#activity' || window.location.hash === '#inbox') history.replaceState(null, '', window.location.pathname + window.location.search)
    if (next === 'send') { setScreen('home'); setSendIntent(count => count + 1); return }
    setSendIntent(0)
    setScreen(next)
  }

  if (!ready) return <AppLoadingScreen />
  if (!authenticated) return <LandingScreen />
  const deploymentTarget = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get('deploy-contract')
    : null
  const deploymentNetwork = deploymentTarget === 'janus-purchase-mainnet'
    ? 'mainnet'
    : deploymentTarget === 'janus-purchase' ? 'testnet' : undefined
  if (deploymentNetwork) return <ContractDeploymentScreen network={deploymentNetwork} onClose={() => {
    history.replaceState(null, '', window.location.pathname)
    window.location.reload()
  }} />
  const purchaseTest = import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('test-contract') === 'janus-purchase'
  if (showLanding) return <LandingScreen inApp onOpenWallet={() => { setShowLanding(false); changeScreen('home') }} />
  if (purchaseRoute) return <div className="min-h-dvh bg-[#090d15]">
    <SharedPurchase network={purchaseRoute.chainId === 5042002 ? 'testnet' : 'mainnet'} initialPurchaseId={purchaseRoute.id}
      onClose={() => { history.replaceState(null, '', window.location.pathname + window.location.search); setPurchaseRoute(undefined) }} />
  </div>
  if (splitId) return <div className="min-h-dvh flex flex-col" style={{ background: '#090d15' }}>
    <Header onHome={openLanding} onOpenAccount={() => leaveSplit('settings')} />
    <main className="flex-1 overflow-y-auto" style={{ paddingTop: '60px' }}>
      <div className="max-w-[480px] mx-auto w-full"><SplitPaymentScreen id={splitId} returnTo={screen} onClose={() => leaveSplit(screen)} onCompletedClose={() => leaveSplit('home')} /></div>
    </main>
  </div>

  const purchaseNotices = (inbox.data?.notifications ?? []).filter(item => item.kind.startsWith('purchase_'))
  const unreadPurchaseNotices = purchaseNotices.filter(item => !item.read_at)
  const unreadGroupJoinNotices = (inbox.data?.notifications ?? []).filter(item => item.kind === 'group_joined' && !item.read_at)
  const noticePurchaseIds = new Set(purchaseNotices.map(item => item.resource_id).filter(Boolean))
  const inboxCount = (inbox.data?.splits?.length ?? 0) + (inbox.data?.groups?.length ?? 0) +
    (inbox.data?.purchases?.filter(item => item.status === 'invited' && !item.read_at && !noticePurchaseIds.has(item.purchase.id)).length ?? 0) +
    unreadPurchaseNotices.length + unreadGroupJoinNotices.length

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: '#090d15' }}>
      <Header onHome={openLanding} onOpenAccount={() => changeScreen('settings')} />
      <main className="flex-1 overflow-y-auto" style={{ paddingTop: '60px', paddingBottom: 'calc(104px + env(safe-area-inset-bottom))' }}>
        <div className="max-w-[480px] mx-auto w-full">
          {screen === 'home' && <WalletScreen key={'wallet-' + sendIntent} initialSendOpen={sendIntent > 0} onViewActivity={() => changeScreen('activity')} onOpenDocs={() => changeScreen('docs')} purchaseNetwork={purchaseTest ? 'testnet' : 'mainnet'} initialPurchaseOpen={purchaseTest} />}
          {screen === 'activity' && <ActivityScreen />}
          {screen === 'inbox' && <InboxScreen />}
          {screen === 'groups' && <GroupsScreen />}
          {screen === 'settings' && <SettingsScreen />}
          {screen === 'docs' && <DocsScreen onBack={() => changeScreen('home')} />}
        </div>
      </main>
      <BottomNav active={screen === 'send' ? 'send' : screen} onChange={changeScreen} inboxCount={inboxCount} />
    </div>
  )
}
