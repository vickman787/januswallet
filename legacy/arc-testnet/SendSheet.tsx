/**
 * SendSheet — direct USDC peer transfer modal.
 */
import React, { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ArrowRight, Loader2, CheckCircle2, AlertCircle, Zap } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { isAddress, encodeFunctionData } from 'viem'
import { USDC_ADDRESS, USDC_DECIMALS, ARC_TESTNET_CHAIN_ID } from '@/contracts'
import { simulateTx } from '@/hooks/useSimulate'

const ERC20_TRANSFER_ABI = [{
  name: 'transfer', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const

interface Props { open: boolean; onClose: () => void }
type Step = 'form' | 'simulating' | 'sim-warn' | 'sending' | 'done' | 'error'

export default function SendSheet({ open, onClose }: Props) {
  const { address, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const wrongChain = chainId !== undefined && chainId !== ARC_TESTNET_CHAIN_ID
  const [step, setStep] = useState<Step>('form')
  const [toAddr, setToAddr] = useState('')
  const [amount, setAmount] = useState('')
  const [simWarn, setSimWarn] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)
  const { writeContractAsync } = useWriteContract()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({ hash: txHash, chainId: ARC_TESTNET_CHAIN_ID })
  const derivedStep: typeof step = txConfirmed && step === 'sending' ? 'done' : step

  const reset = useCallback(() => {
    setStep('form'); setToAddr(''); setAmount('')
    setSimWarn(null); setTxError(null); setTxHash(undefined)
  }, [])

  const handleClose = useCallback(() => { reset(); onClose() }, [reset, onClose])

  const parseAmt = useCallback((): bigint | null => {
    try {
      const factor = 10n ** BigInt(USDC_DECIMALS)
      const [int = '0', frac = ''] = amount.trim().split('.')
      const f = frac.padEnd(USDC_DECIMALS, '0').slice(0, USDC_DECIMALS)
      const raw = BigInt(int) * factor + BigInt(f || '0')
      return raw > 0n ? raw : null
    } catch { return null }
  }, [amount])

  const handleSend = useCallback(async () => {
    if (!address) return
    const raw = parseAmt()
    if (!raw || !isAddress(toAddr)) return
    setStep('simulating')
    const calldata = encodeFunctionData({ abi: ERC20_TRANSFER_ABI, functionName: 'transfer', args: [toAddr, raw] })
    const sim = await simulateTx({ from: address, to: USDC_ADDRESS, data: calldata })
    if (!sim.success && !sim.mock) { setSimWarn(sim.error ?? 'Transaction would revert'); setStep('sim-warn'); return }
    setSimWarn(sim.mock && sim.error ? `Note: ${sim.error}` : null)
    if (chainId !== ARC_TESTNET_CHAIN_ID) {
      try { await switchChainAsync({ chainId: ARC_TESTNET_CHAIN_ID }) }
      catch { setTxError('Please switch to Arc Testnet first.'); setStep('error'); return }
    }
    setStep('sending')
    try {
      const hash = await writeContractAsync({
        address: USDC_ADDRESS, abi: ERC20_TRANSFER_ABI, functionName: 'transfer',
        args: [toAddr, raw], chainId: ARC_TESTNET_CHAIN_ID,
      })
      setTxHash(hash)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      setTxError(msg.includes('User rejected') ? 'You rejected the transaction.' : msg)
      setStep('error')
    }
  }, [address, chainId, toAddr, parseAmt, writeContractAsync, switchChainAsync])

  const raw = parseAmt()
  const isValid = isAddress(toAddr) && raw !== null

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="bd" className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.4)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleClose} />
          <motion.div key="sheet"
            className="fixed bottom-0 inset-x-0 z-50 rounded-t-2xl p-5 pb-10 mx-auto max-w-md"
            style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-strong)' }} />
            </div>
            <div className="flex items-center justify-between mb-5">
              <p className="font-bold text-lg" style={{ color: 'var(--ink)' }}>Send USDC</p>
              <button onClick={handleClose} className="flex size-8 items-center justify-center rounded-lg hover:bg-gray-100">
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>

            {(derivedStep === 'form' || derivedStep === 'simulating') && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--muted)' }}>
                    To Address
                  </label>
                  <input type="text" placeholder="0x..." value={toAddr}
                    onChange={e => setToAddr(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-blue-200"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--muted)' }}>
                    Amount (USDC)
                  </label>
                  <input type="number" placeholder="0.00" min="0" step="0.01" value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
                </div>
                {wrongChain ? (
                  <button onClick={() => { void switchChainAsync({ chainId: ARC_TESTNET_CHAIN_ID }) }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white"
                    style={{ background: 'var(--accent)' }}>
                    Switch to Arc Testnet
                  </button>
                ) : (
                  <button onClick={() => { void handleSend() }}
                    disabled={!isValid || derivedStep === 'simulating'}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: 'var(--accent)' }}>
                    {derivedStep === 'simulating'
                      ? <><Loader2 className="size-4 animate-spin" /> Checking...</>
                      : <><ArrowRight className="size-4" /> Send</>}
                  </button>
                )}
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  <Zap className="size-3" style={{ color: 'var(--subtle)' }} />
                  <p className="text-xs" style={{ color: 'var(--subtle)' }}>Pre-flight check via Tenderly</p>
                </div>
              </div>
            )}

            {derivedStep === 'sim-warn' && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: 'var(--danger-light)', border: '1px solid #fecaca' }}>
                  <AlertCircle className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Would Fail</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{simWarn}</p>
                  </div>
                </div>
                <button onClick={() => setStep('form')} className="w-full rounded-xl py-3 text-sm font-medium"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }}>
                  Go Back
                </button>
              </div>
            )}

            {derivedStep === 'sending' && (
              <div className="flex flex-col items-center py-8 gap-3">
                <Loader2 className="size-10 animate-spin" style={{ color: 'var(--accent)' }} />
                <p className="font-semibold" style={{ color: 'var(--ink)' }}>Sending...</p>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Waiting for confirmation</p>
              </div>
            )}

            {derivedStep === 'done' && (
              <div className="flex flex-col items-center py-8 gap-3">
                <CheckCircle2 className="size-12" style={{ color: 'var(--success)' }} />
                <p className="font-bold text-lg" style={{ color: 'var(--ink)' }}>Sent!</p>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>USDC transfer confirmed.</p>
                <button onClick={handleClose} className="mt-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white"
                  style={{ background: 'var(--accent)' }}>Done</button>
              </div>
            )}

            {derivedStep === 'error' && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-xl p-4" style={{ background: 'var(--danger-light)', border: '1px solid #fecaca' }}>
                  <AlertCircle className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Transfer Failed</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{txError}</p>
                  </div>
                </div>
                <button onClick={() => setStep('form')} className="w-full rounded-xl py-3 text-sm font-medium"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }}>
                  Try Again
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
