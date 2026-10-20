import React from 'react'
import { Loader2 } from 'lucide-react'
import { useAccount, useSwitchChain } from 'wagmi'
import { ARC_TESTNET_CHAIN_ID } from '@/contracts'

interface TransactionButtonProps {
  label: string
  onClick: () => void
  isPending?: boolean
  isConfirming?: boolean
  disabled?: boolean
  className?: string
  variant?: 'primary' | 'secondary' | 'danger'
}

export default function TransactionButton({
  label, onClick, isPending = false, isConfirming = false,
  disabled = false, className = '', variant = 'primary',
}: TransactionButtonProps) {
  const { isConnected, chainId } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const wrongChain = isConnected && chainId !== ARC_TESTNET_CHAIN_ID

  const handleClick = () => {
    if (wrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return }
    onClick()
  }

  const busy = isPending || isConfirming || isSwitching
  const isDisabled = disabled || busy || !isConnected

  const bg = variant === 'danger' ? 'var(--danger)'
    : variant === 'secondary' ? 'var(--surface-2)'
    : 'var(--accent)'
  const color = variant === 'secondary' ? 'var(--ink)' : '#ffffff'
  const border = variant === 'secondary' ? '1px solid var(--border)' : 'none'

  return (
    <button
      disabled={isDisabled}
      onClick={handleClick}
      className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-opacity disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={{ background: bg, color, border }}
    >
      {busy ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {isConfirming ? 'Confirming...' : isSwitching ? 'Switching...' : 'Pending...'}
        </>
      ) : wrongChain ? (
        'Switch to Arc Testnet'
      ) : (
        label
      )}
    </button>
  )
}
