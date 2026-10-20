/**
 * QRModal — shows a deep-link QR code for sharing a bill with payers.
 * Deep link format: <origin>/pay/<billId>?amount=<perShare>&to=<recipient>
 */
import React, { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Copy, Check } from 'lucide-react'
import { formatUsdc } from '@/contracts'
import type { BillData } from './BillCard'

interface Props {
  open: boolean
  bill: BillData | null
  /** The caller's share amount (0n = equal split shown) */
  myShare?: bigint
  onClose: () => void
}

const CANVAS_SIZE = 220

// Tiny QR encoder using a data-URL canvas approach via a public CDN-free method.
// We generate the QR via the free ZXing WASM or fallback to an inline SVG grid.
// For zero-dependency, we use the browser's built-in BarcodeDetector / or an iframe trick.
// Simplest reliable approach: encode via qrcode.react-style canvas draw using
// a minimal Reed-Solomon implementation adapted for this use case.
// For hackathon scope we use the free api.qrserver.com service.

function QRImage({ url }: { url: string }) {
  // arc-studio-allow-onchain-literal — QR Server is a public utility API, not an RPC endpoint
  const qrApi = 'https://api.qrserver.com'
  const src = `${qrApi}/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&format=svg&color=122d45&bgcolor=ffffff&qzone=1`
  return (
    <img
      src={src}
      alt="QR Code"
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      className="rounded-2xl"
      style={{ imageRendering: 'crisp-edges' }}
    />
  )
}

export default function QRModal({ open, bill, myShare, onClose }: Props) {
  const [copied, setCopied] = React.useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (!bill) return null

  const shareAmount = myShare ?? (bill.shares[0] ?? 0n)
  const deepLink = `${window.location.origin}/pay/${bill.billId.toString()}?amount=${shareAmount.toString()}&to=${bill.recipient}`

  const handleCopy = () => {
    void navigator.clipboard.writeText(deepLink)
    setCopied(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(18,45,69,0.38)', backdropFilter: 'blur(8px)' }}
            onClick={onClose}
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1.0] }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 rounded-2xl p-6 mx-auto max-w-xs"
            style={{
              background: 'rgba(255,255,255,0.96)',
              boxShadow: '0 24px 64px rgba(18,45,69,0.18)',
              border: '1px solid var(--border)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-bold text-base" style={{ color: 'var(--ink)' }}>
                  Share Bill
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  Scan to pay your share
                </p>
              </div>
              <button
                onClick={onClose}
                className="flex size-8 items-center justify-center rounded-full"
                style={{ background: 'rgba(18,45,69,0.06)' }}
              >
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>

            <div className="flex flex-col items-center gap-4">
              <div
                className="rounded-2xl p-2"
                style={{ background: '#fff', boxShadow: '0 2px 12px rgba(18,45,69,0.10)' }}
              >
                <QRImage url={deepLink} />
              </div>

              <div
                className="w-full rounded-2xl px-3 py-2 text-center"
                style={{ background: 'rgba(18,45,69,0.04)' }}
              >
                <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                  Share for
                </p>
                <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                  {formatUsdc(shareAmount)} USDC
                </p>
              </div>

              <button
                onClick={handleCopy}
                className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(18,45,69,0.08)',
                  color: copied ? '#16a34a' : 'var(--ink)',
                }}
              >
                {copied ? (
                  <><Check className="size-4" /> Copied!</>
                ) : (
                  <><Copy className="size-4" /> Copy Link</>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
