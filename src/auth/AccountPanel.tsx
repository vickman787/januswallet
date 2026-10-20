import { BaseError } from 'viem'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount, useSignMessage, useSwitchChain } from 'wagmi'
import { useJanusAuth } from './AccountProvider'

type Me = { profile: { username: string; display_name: string } | null; wallets: { address: string; chain_id: number }[] }
const button = 'rounded-xl bg-[#4D6BFF] px-4 py-2 text-sm text-white disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white'
export default function AccountPanel() {
  const auth = useJanusAuth()
  const { address } = useAccount()
  if (!auth.configured || !auth.authenticated) return null
  return <AccountDetails key={`${auth.subject}:${address}`} />
}
function AccountDetails() {
  const auth = useJanusAuth()
  const { address, chainId } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { switchChainAsync } = useSwitchChain()
  const queries = useQueryClient()
  const [usernameInput, setUsername] = useState<string | null>(null)
  const [displayNameInput, setDisplayName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const queryKey = ['janus-account', auth.subject, address] as const
  async function api<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
    const token = await auth.token()
    if (!alive.current) throw new Error('Your account changed. Start again.')
    if (!token) throw new Error('Sign in again to continue.')
    const response = await fetch(`/api/${path}`, { method, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), cache: 'no-store', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Account service is unavailable. Try again later.')
    const result: unknown = await response.json()
    if (!response.ok) throw new Error(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string' ? result.error : 'Account service is unavailable.')
    return result as T
  }
  const me = useQuery({ queryKey, enabled: auth.ready && auth.authenticated && !!auth.subject,
    queryFn: ({ signal }) => api<Me>('me', 'GET', undefined, signal), retry: false, staleTime: 30000 })
  const username = usernameInput ?? me.data?.profile?.username ?? ''
  const displayName = displayNameInput ?? me.data?.profile?.display_name ?? ''
  async function run(action: () => Promise<void>) {
    setBusy(true); setStatus('')
    try { await action() } catch (error) { if (alive.current) setStatus(error instanceof BaseError ? error.shortMessage : error instanceof Error ? error.message : 'Unable to complete this action.') }
    finally { if (alive.current) setBusy(false) }
  }
  const verified = me.data?.wallets.some(wallet => wallet.address === address?.toLowerCase() && wallet.chain_id === 5042)
  return <section aria-label="JANUS account" className="mx-4 my-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left text-[#C8CDD6]">
    <h2 className="font-semibold text-[#F1F3F2]">Profile</h2>
    <>
      {me.isPending && <p role="status" className="my-3 text-sm">Loading your profile…</p>}
      {me.error && <div role="alert" className="my-3 text-sm"><p>{me.error.message}</p><button className={button} onClick={() => void me.refetch()}>Retry</button></div>}
      {me.data && <form className="mt-3 flex flex-col gap-3" onSubmit={event => { event.preventDefault(); void run(async () => {
        await api('profile', 'PUT', { username, displayName })
        if (!alive.current) return
        await queries.invalidateQueries({ queryKey: ['janus-account', auth.subject] }); if (!alive.current) return; setUsername(null); setDisplayName(null); setStatus('Profile saved.')
      }) }}>
        <label className="text-sm">Username<input className="mt-1 w-full rounded-lg border border-white/15 bg-[#0B0D12] p-2" required pattern="[a-z0-9_]{1,32}" maxLength={32} autoComplete="username" value={username} onChange={event => setUsername(event.target.value.toLowerCase())} /></label>
        <label className="text-sm">Display name<input className="mt-1 w-full rounded-lg border border-white/15 bg-[#0B0D12] p-2" required maxLength={80} autoComplete="nickname" value={displayName} onChange={event => setDisplayName(event.target.value)} /></label>
        <button className={button} disabled={busy}>Save profile</button>
      </form>}
      {me.data?.profile && <div className="mt-4 text-sm">
        <p className="mb-2">{verified ? 'Connected wallet verified for this account.' : 'Verify your connected wallet to associate it with your account. This signature does not send funds.'}</p>
        {address && chainId !== 5042 && <button className={button} disabled={busy} onClick={() => void run(async () => { await switchChainAsync({ chainId: 5042 }) })}>Switch to Arc Mainnet</button>}
        {!verified && address && <button className={button} disabled={busy || !address || chainId !== 5042} onClick={() => void run(async () => {
          const challenge = await api<{ id: string; message: string }>('wallet/challenge', 'POST', { address })
          if (!alive.current) return
          const signature = await signMessageAsync({ account: address, message: challenge.message })
          if (!alive.current) return
          await api('wallet/verify', 'POST', { id: challenge.id, signature })
          if (!alive.current) return
          await queries.invalidateQueries({ queryKey }); if (!alive.current) return; setStatus('Wallet verified.')
        })}>{!address ? 'Connect a wallet first' : chainId !== 5042 ? 'Verification requires Arc Mainnet' : 'Verify connected wallet'}</button>}
      </div>}
    </>
    {status && <p role="status" className="mt-3 text-sm">{status}</p>}
  </section>
}
