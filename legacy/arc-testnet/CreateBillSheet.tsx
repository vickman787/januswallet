import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Trash2 } from 'lucide-react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import {
  JANUS_SPLITTER,
  USDC_ADDRESS,
  parseUsdc,
  formatUsdc,
  stringToBytes32,
  ARC_TESTNET_CHAIN_ID,
} from '@/contracts'
import { spectral, springs } from './GlassCard'
import TransactionButton from './TransactionButton'
import { buildTxExplorerUrl } from '@/onchain-facts'

interface CreateBillSheetProps {
  open: boolean
  onClose: () => void
  onCreated: (billId: bigint) => void
}

interface ParticipantRow {
  address: string
  amount: string
}

export default function CreateBillSheet({ open, onClose, onCreated }: CreateBillSheetProps) {
  const { address } = useAccount()
  const [description, setDescription] = useState('')
  const [recipient, setRecipient] = useState('')
  const [participants, setParticipants] = useState<ParticipantRow[]>([
    { address: '', amount: '' },
  ])
  const [deadlineHours, setDeadlineHours] = useState('24')

  const totalRaw = participants.reduce((sum, p) => {
    try { return sum + parseUsdc(p.amount || '0') } catch { return sum }
  }, 0n)

  // USDC balance
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address },
  })

  // Approve USDC
  const {
    writeContract: approve,
    data: approveHash,
    isPending: approvePending,
  } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash })

  // Create bill
  const {
    writeContract: createBill,
    data: createHash,
    isPending: createPending,
  } = useWriteContract()
  const { isLoading: createConfirming, isSuccess: createSuccess, data: createReceipt } =
    useWaitForTransactionReceipt({ hash: createHash })

  // approvalDone is true once the approval tx confirms; reset on form close
  const [approvalDone, setApprovalDone] = React.useState(false)
  // Sync approval state — derive it from wagmi state outside effect to avoid set-state-in-effect
  const derivedApprovalDone = approvalDone || approveSuccess

  const resetForm = React.useCallback(() => {
    setDescription('')
    setRecipient('')
    setParticipants([{ address: '', amount: '' }])
    setDeadlineHours('24')
    setApprovalDone(false)
  }, [])

  // Show toast on approval and persist state so it survives wagmi reset
  React.useEffect(() => {
    if (approveSuccess) {
      toast.success('USDC approved')
      setApprovalDone(true)
    }
    // oxlint-disable-next-line react/set-state-in-effect
  }, [approveSuccess])

  // Handle create success — parse BillCreated event log for billId
  React.useEffect(() => {
    if (createSuccess && createReceipt && createHash) {
      const explorerUrl = buildTxExplorerUrl(ARC_TESTNET_CHAIN_ID, createHash)
      // Find BillCreated log: topic0 = keccak256("BillCreated(uint256,address,address,uint256,uint256)")
      const BILL_CREATED_TOPIC = '0x0b22cc30b3a4e2a5fc3de95aabe0d5dc43aef0e4d8d63db4f8b4cff4a8de8818'
      let billId = 1n
      for (const log of createReceipt.logs) {
        if (log.topics[0]?.toLowerCase() === BILL_CREATED_TOPIC.toLowerCase() && log.topics[1]) {
          billId = BigInt(log.topics[1])
          break
        }
      }
      toast.success('Bill created!', {
        action: { label: 'View tx', onClick: () => window.open(explorerUrl, '_blank') },
      })
      onCreated(billId)
      onClose()
      resetForm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSuccess, createReceipt, createHash])

  const addParticipant = () => {
    if (participants.length < 20) {
      setParticipants([...participants, { address: '', amount: '' }])
    }
  }

  const removeParticipant = (i: number) => {
    setParticipants(participants.filter((_, idx) => idx !== i))
  }

  const updateParticipant = (i: number, field: 'address' | 'amount', val: string) => {
    const next = [...participants]
    next[i] = { ...next[i], [field]: val }
    setParticipants(next)
  }

  const isValid =
    description.trim().length > 0 &&
    recipient.startsWith('0x') &&
    recipient.length === 42 &&
    participants.every(p => p.address.startsWith('0x') && p.address.length === 42 && parseFloat(p.amount) > 0) &&
    totalRaw > 0n &&
    parseInt(deadlineHours) > 0

  const handleApprove = () => {
    approve({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [JANUS_SPLITTER.address, totalRaw],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  const handleCreate = () => {
    const shares = participants.map(p => parseUsdc(p.amount))
    const addrs = participants.map(p => p.address as `0x${string}`)
    const descBytes = stringToBytes32(description.slice(0, 32))
    const deadline = BigInt(Math.floor(Date.now() / 1000) + parseInt(deadlineHours) * 3600)
    createBill({
      address: JANUS_SPLITTER.address,
      abi: JANUS_SPLITTER.abi,
      functionName: 'createBill',
      args: [recipient as `0x${string}`, shares, addrs, descBytes, deadline],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

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
              
              
              maxHeight: '90dvh',
              overflowY: 'auto',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={springs.sheet}
            onClick={e => e.stopPropagation()}
          >
            {/* Spectral strip */}
            <div className="h-1 sticky top-0 z-10" style={{ background: spectral }} />

            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 sticky top-1 z-10 bg-white">
              <div className="h-1 w-10 rounded-full bg-black/10" />
            </div>

            <div className="px-5 pb-8 pt-2">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <h2 className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
                  New Bill
                </h2>
                <button
                  onClick={onClose}
                  className="flex size-8 items-center justify-center rounded-full hover:bg-black/5 transition-colors"
                >
                  <X className="size-4" style={{ color: 'var(--muted)' }} />
                </button>
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--muted)' }}>
                  WHAT FOR
                </label>
                <div className="rounded-2xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <input
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Dinner at Nobu, team lunch..."
                    maxLength={32}
                    className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-slate-300"
                    style={{ color: 'var(--ink)' }}
                  />
                </div>
              </div>

              {/* Recipient */}
              <div className="mb-4">
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--muted)' }}>
                  SEND FUNDS TO
                </label>
                <div className="rounded-2xl p-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <input
                    value={recipient}
                    onChange={e => setRecipient(e.target.value)}
                    placeholder="0x... recipient address"
                    className="w-full bg-transparent text-xs font-medium outline-none placeholder:text-slate-300 mono"
                    style={{ color: 'var(--ink)' }}
                  />
                </div>
                <button
                  onClick={() => address && setRecipient(address)}
                  className="mt-1.5 text-xs font-semibold"
                  style={{ color: 'var(--accent-hover)' }}
                >
                  Use my address
                </button>
              </div>

              {/* Deadline */}
              <div className="mb-4">
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: 'var(--muted)' }}>
                  PAYMENT DEADLINE
                </label>
                <div className="flex gap-2">
                  {['1', '6', '24', '72'].map(h => (
                    <button
                      key={h}
                      onClick={() => setDeadlineHours(h)}
                      className="flex-1 rounded-xl py-2 text-xs font-semibold transition-colors"
                      style={
                        deadlineHours === h
                          ? { background: 'var(--accent)', color: 'white' }
                          : { background: 'rgba(18,45,69,0.06)', color: 'var(--muted)' }
                      }
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>

              {/* Participants */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    PARTICIPANTS &amp; SHARES
                  </label>
                  <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                    {participants.length}/20
                  </span>
                </div>

                <div className="space-y-2">
                  {participants.map((p, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <div className="flex-1 rounded-xl p-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <input
                          value={p.address}
                          onChange={e => updateParticipant(i, 'address', e.target.value)}
                          placeholder="0x..."
                          className="w-full bg-transparent text-xs outline-none placeholder:text-slate-300 mono"
                          style={{ color: 'var(--ink)' }}
                        />
                      </div>
                      <div className="w-20 rounded-xl p-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <input
                          inputMode="decimal"
                          value={p.amount}
                          onChange={e => {
                            const v = e.target.value.replace(/[^0-9.]/g, '')
                            if (v === '' || /^\d*\.?\d*$/.test(v)) updateParticipant(i, 'amount', v)
                          }}
                          placeholder="0.00"
                          className="w-full bg-transparent text-xs font-semibold outline-none placeholder:text-slate-300 tabular-nums text-right"
                          style={{ color: 'var(--ink)' }}
                        />
                      </div>
                      {participants.length > 1 && (
                        <button
                          onClick={() => removeParticipant(i)}
                          className="flex size-7 items-center justify-center rounded-full hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="size-3.5" style={{ color: 'var(--danger)' }} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={addParticipant}
                  disabled={participants.length >= 20}
                  className="mt-2 flex items-center gap-1 text-xs font-semibold disabled:opacity-40 transition-opacity"
                  style={{ color: 'var(--accent-hover)' }}
                >
                  <Plus className="size-3" />
                  Add participant
                </button>
              </div>

              {/* Total row */}
              <div
                className="flex items-center justify-between rounded-2xl px-4 py-3 mb-5"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  Total
                </span>
                <span
                  className="display text-lg font-bold tabular-nums"
                  style={{ color: 'var(--ink)' }}
                >
                  {formatUsdc(totalRaw)}{' '}
                  <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>
                    USDC
                  </span>
                </span>
              </div>

              {/* Balance */}
              {usdcBalance !== undefined && (
                <p className="text-xs mb-4 text-center" style={{ color: 'var(--subtle)' }}>
                  Your balance: {formatUsdc(usdcBalance)} USDC
                </p>
              )}

              {/* Step 1: Approve */}
              {!derivedApprovalDone && (
                <TransactionButton
                  label={`Approve ${formatUsdc(totalRaw)} USDC`}
                  onClick={handleApprove}
                  isPending={approvePending}
                  isConfirming={approveConfirming}
                  disabled={!isValid}
                />
              )}

              {/* Step 2: Create */}
              {derivedApprovalDone && (
                <TransactionButton
                  label="Create Bill"
                  onClick={handleCreate}
                  isPending={createPending}
                  isConfirming={createConfirming}
                  disabled={!isValid}
                />
              )}

              {derivedApprovalDone && (
                <p className="text-xs text-center mt-2" style={{ color: 'var(--success)' }}>
                  USDC approved. Ready to create.
                </p>
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
