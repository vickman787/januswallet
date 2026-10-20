/**
 * FaucetButton — modal for getting Arc Testnet USDC via Circle's faucet.
 */
import React, { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Copy, Check, ExternalLink, Droplets } from 'lucide-react'
import { useAccount } from 'wagmi'

const FAUCET_URL = 'https://faucet.circle.com/'

interface Props {
  open: boolean
  onClose: () => void
}

export default function FaucetButton({ open, onClose }: Props) {
  const { address } = useAccount()
  const [copied, setCopied] = useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = () => {
    if (!address) return
    void navigator.clipboard.writeText(address)
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="bd"
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key="card"
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-2xl p-5 mx-auto max-w-sm"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Droplets className="size-4" style={{ color: 'var(--accent)' }} />
                <p className="font-semibold text-base" style={{ color: 'var(--ink)' }}>Get Test USDC</p>
              </div>
              <button
                onClick={onClose}
                className="flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
              >
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>

            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              Arc Testnet USDC comes from Circle's faucet. Get up to 20 USDC every 2 hours.
            </p>

            {/* Steps */}
            <ol className="space-y-2 mb-4">
              {[
                'Open faucet.circle.com (button below)',
                'Select "Arc Testnet" from the network dropdown',
                'Paste your wallet address and click Send',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm" style={{ color: 'var(--ink-2)' }}>
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white mt-0.5"
                    style={{ background: 'var(--accent)' }}
                  >
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            {/* Address copy */}
            {address && (
              <div
                className="flex items-center justify-between rounded-lg px-3 py-2 mb-3"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <p className="font-mono text-xs truncate mr-2" style={{ color: 'var(--muted)' }}>
                  {address}
                </p>
                <button
                  onClick={handleCopy}
                  className="flex shrink-0 items-center gap-1 text-xs font-medium transition-colors"
                  style={{ color: copied ? 'var(--success)' : 'var(--accent)' }}
                >
                  {copied ? <><Check className="size-3.5" />Copied</> : <><Copy className="size-3.5" />Copy</>}
                </button>
              </div>
            )}

            <button
              onClick={() => window.open(FAUCET_URL, '_blank', 'noopener,noreferrer')}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              <ExternalLink className="size-4" />
              Open Circle Faucet
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
