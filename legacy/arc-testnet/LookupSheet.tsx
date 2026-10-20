import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search } from 'lucide-react'
import { useReadContract } from 'wagmi'
import { JANUS_SPLITTER, ARC_TESTNET_CHAIN_ID, billStatusLabel, bytes32ToString, formatUsdc } from '@/contracts'
import { glass, springs } from './GlassCard'
import type { BillData } from './BillCard'

interface LookupSheetProps {
  open: boolean
  onClose: () => void
  onOpen: (bill: BillData) => void
}

export default function LookupSheet({ open, onClose, onOpen }: LookupSheetProps) {
  const [input, setInput] = useState('')
  const billId = input.trim() ? BigInt(parseInt(input)) : undefined

  const { data, isLoading, isError } = useReadContract({
    address: JANUS_SPLITTER.address,
    abi: JANUS_SPLITTER.abi,
    functionName: 'getBill',
    args: billId ? [billId] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!billId && billId > 0n },
  })

  // data is a tuple: [creator, recipient, totalAmount, amountPaid, deadline, status, description, participants, shares]
  const bill: BillData | null = data && Array.isArray(data)
    ? {
        billId: billId!,
        creator: data[0] as string,
        recipient: data[1] as string,
        totalAmount: data[2] as bigint,
        amountPaid: data[3] as bigint,
        deadline: data[4] as bigint,
        status: data[5] as number,
        description: data[6] as string,
        participants: data[7] as readonly string[],
        shares: data[8] as readonly bigint[],
      }
    : null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-2xl"
            style={{
              background: 'var(--surface)',
              
              
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={springs.sheet}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pb-8 pt-2">
              <div className="flex items-center justify-between mb-5">
                <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
                  Look Up a Bill
                </h2>
                <button
                  onClick={onClose}
                  className="flex size-8 items-center justify-center rounded-full hover:bg-black/5 transition-colors"
                >
                  <X className="size-4" style={{ color: 'var(--muted)' }} />
                </button>
              </div>

              <div className="relative mb-4">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 size-4"
                  style={{ color: 'var(--subtle)' }}
                />
                <input
                  type="number"
                  min="1"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Enter Bill ID..."
                  className="w-full rounded-2xl py-3 pl-9 pr-4 text-sm font-medium outline-none"
                  style={{ ...glass.inner, color: 'var(--ink)' }}
                />
              </div>

              {isLoading && (
                <p className="text-center text-sm py-6" style={{ color: 'var(--subtle)' }}>
                  Loading...
                </p>
              )}

              {isError && (
                <p className="text-center text-sm py-6" style={{ color: 'var(--danger)' }}>
                  Bill not found
                </p>
              )}

              {bill && (
                <div
                  className="rounded-2xl p-4 cursor-pointer hover:scale-[1.01] transition-transform"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px' }}
                  onClick={() => { onOpen(bill); onClose() }}
                >
                  <p className="display font-semibold text-sm mb-1" style={{ color: 'var(--ink)' }}>
                    {bytes32ToString(bill.description) || `Bill #${bill.billId.toString()}`}
                  </p>
                  <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
                    {billStatusLabel(bill.status)} · {bill.participants.length} participant{bill.participants.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="display text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                      {formatUsdc(bill.totalAmount)}
                    </span>
                    <span className="text-sm" style={{ color: 'var(--subtle)' }}>USDC</span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--accent-hover)' }}>
                    Tap to view details
                  </p>
                </div>
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
