import { useState } from 'react'
import { toast } from 'sonner'
import { useJanusAuth } from '../auth/AccountProvider'

export default function CreateWalletActions() {
  const auth = useJanusAuth()
  const [creating, setCreating] = useState(false)

  async function createWallet() {
    if (creating) return
    setCreating(true)
    try {
      await auth.createWallet()
      toast.success('Your JANUS wallet is ready.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Wallet creation failed. Try again.')
    } finally {
      setCreating(false)
    }
  }

  return <div className="flex flex-col gap-3">
    <button onClick={() => { void createWallet() }} disabled={!auth.ready || creating}
      className="janus-primary w-full disabled:opacity-50">{creating ? 'Creating wallet…' : 'Create JANUS wallet'}</button>
    <button onClick={auth.connectWallet} disabled={!auth.ready || creating}
      className="janus-secondary w-full disabled:opacity-50">Connect existing wallet</button>
  </div>
}