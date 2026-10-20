import { createContext, lazy, Suspense, useContext, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from '../config'
import AppLoadingScreen from '../components/AppLoadingScreen'
export type AuthSession = {
  configured: boolean; ready: boolean; authenticated: boolean; subject: string | null
  login: () => void; logout: () => Promise<void>; token: () => Promise<string | null>
  connectWallet: () => void; createWallet: () => Promise<void>; selectWallet: (address: string) => Promise<void>
  wallets: { address: string; label: string }[]; walletsReady: boolean
}
export const AuthContext = createContext<AuthSession>({ configured: false, ready: true, authenticated: false, subject: null,
  login: () => {}, logout: () => Promise.resolve(), token: () => Promise.resolve(null),
  connectWallet: () => {}, createWallet: () => Promise.reject(new Error('Sign in is unavailable.')), selectWallet: () => Promise.resolve(), wallets: [], walletsReady: true })
export const useJanusAuth = () => useContext(AuthContext)
const PrivySession = lazy(() => import('./PrivySession'))
const queryClient = new QueryClient()
export function AccountProvider({ children }: { children: ReactNode }) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID?.trim()
  if (!appId) return <QueryClientProvider client={queryClient}><WagmiProvider config={config} reconnectOnMount={false}>{children}</WagmiProvider></QueryClientProvider>
  return <Suspense fallback={<AppLoadingScreen />}><PrivySession appId={appId} queryClient={queryClient}>{children}</PrivySession></Suspense>
}
