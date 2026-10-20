import { PrivyProvider, usePrivy, useWallets, useConnectWallet, useCreateWallet } from '@privy-io/react-auth'
import { WagmiProvider } from '@privy-io/wagmi'
import { QueryClientProvider, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useState, type ReactNode, type ComponentProps } from 'react'
import { arc, arcTestnet, mainnet } from 'viem/chains'
import { AuthContext } from './AccountProvider'
import { config } from '../config'

type Selection = { subject: string; address: string } | null
type Selector = NonNullable<ComponentProps<typeof WagmiProvider>['setActiveWalletForWagmi']>
function Session({ children, choose }: { children: ReactNode; choose: (value: Selection) => void }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const { createWallet: createPrivyWallet } = useCreateWallet()
  const queries = useQueryClient()
  const { connectWallet } = useConnectWallet({ onSuccess: ({ wallet }) => {
    if (user) choose({ subject: user.id, address: wallet.address })
  } })
  const signOut = async () => {
    await logout()
    choose(null)
    await queries.cancelQueries()
    queries.clear()
  }
  const selectWallet = (address: string) => {
    const wallet = wallets.find(item => item.address.toLowerCase() === address.toLowerCase())
    if (!user || !authenticated || !wallet) return Promise.reject(new Error('Choose a connected wallet.'))
    choose({ subject: user.id, address: wallet.address })
    return Promise.resolve()
  }
  const createWallet = async () => {
    if (!ready || !authenticated || !user || !walletsReady) throw new Error('Sign in before creating a wallet.')
    const wallet = await createPrivyWallet()
    choose({ subject: user.id, address: wallet.address })
  }
  return <AuthContext.Provider value={{ configured: true, ready: ready && (!authenticated || walletsReady), authenticated, subject: authenticated ? user?.id ?? null : null,
    login, logout: signOut, token: getAccessToken, connectWallet: () => connectWallet({ walletChainType: 'ethereum-only' }), createWallet, selectWallet,
    walletsReady, wallets: authenticated ? wallets.map(wallet => ({ address: wallet.address, label: wallet.meta.name })) : [] }}>{children}</AuthContext.Provider>
}
function WalletSession({ children }: { children: ReactNode }) {
  const { ready, authenticated } = usePrivy()
  const [selection, choose] = useState<Selection>(null)
  const activeWallet = useCallback<Selector>(({ wallets, user }) => {
    if (!ready || !authenticated || !user) return undefined
    const preferred = selection?.subject === user.id ? selection.address : user.wallet?.address
    return wallets.find(wallet => wallet.address.toLowerCase() === preferred?.toLowerCase()) ?? wallets[0]
  }, [ready, authenticated, selection])
  return <WagmiProvider config={config} setActiveWalletForWagmi={activeWallet}>
    <Session choose={choose}>{children}</Session>
  </WagmiProvider>
}
export default function PrivySession({ appId, queryClient, children }: { appId: string; queryClient: QueryClient; children: ReactNode }) {
  return <PrivyProvider appId={appId} config={{ loginMethods: ['email', 'google', 'wallet'], defaultChain: arc, supportedChains: [arc, arcTestnet, mainnet],
    appearance: { theme: 'dark', accentColor: '#4D6BFF', walletChainType: 'ethereum-only' },
    embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' }, solana: { createOnLogin: 'off' } } }}>
    <QueryClientProvider client={queryClient}><WalletSession>{children}</WalletSession></QueryClientProvider>
  </PrivyProvider>
}
