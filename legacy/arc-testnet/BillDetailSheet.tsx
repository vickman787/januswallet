import React, { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle2, Clock, ExternalLink, QrCode, Zap } from 'lucide-react'
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi'
import { erc20Abi, encodeFunctionData } from 'viem'
import { toast } from 'sonner'
import type { BillData } from './BillCard'
import {
  JANUS_SPLITTER,
  USDC_ADDRESS,
  formatUsdc,
  billStatusLabel,
  bytes32ToString,
  ARC_TESTNET_CHAIN_ID,
} from '@/contracts'
import { springs } from './GlassCard'
import TransactionButton from './TransactionButton'
import { buildTxExplorerUrl } from '@/onchain-facts'
import QRModal from './QRModal'
import { simulateTx } from '@/hooks/useSimulate'

interface BillDetailSheetProps {
  bill: BillData | null
  open: boolean
  onClose: () => void
  onRefresh: () => void
}

function shortenAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export default function BillDetailSheet({
  bill,
  open,
  onClose,
  onRefresh,
}: BillDetailSheetProps) {
  const { address } = useAccount()
  const [showQR, setShowQR] = useState(false)
  const [simStatus, setSimStatus] = useState<'idle' | 'running' | 'warn'>('idle')

  // All hooks unconditional — guarded by `enabled` / conditional args
  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const status = bill ? billStatusLabel(bill.status) : 'Open'
  const isParticipant = !!bill && bill.participants.some(
    p => p.toLowerCase() === (address?.toLowerCase() ?? '')
  )
  const participantIdx = bill
    ? bill.participants.findIndex(p => p.toLowerCase() === (address?.toLowerCase() ?? ''))
    : -1
  const myShare = participantIdx >= 0 && bill ? bill.shares[participantIdx] : 0n

  // Unconditional hooks — enabled only when needed
  const { data: hasPaid } = useReadContract({
    address: JANUS_SPLITTER.address,
    abi: JANUS_SPLITTER.abi,
    functionName: 'hasParticipantPaid',
    args: bill && address ? [bill.billId, address] : [0n, `0x${'0'.repeat(40)}`],
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address && isParticipant && !!bill },
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, JANUS_SPLITTER.address] : [`0x${'0'.repeat(40)}`, JANUS_SPLITTER.address],
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address && isParticipant && status === 'Open' },
  })

  const { writeContract: approve, data: approveHash, isPending: approvePending } =
    useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash })

  React.useEffect(() => {
    if (approveSuccess) {
      toast.success('USDC approved')
      void refetchAllowance()
    }
  }, [approveSuccess, refetchAllowance])

  React.useEffect(() => {
    if (isSuccess && txHash) {
      const url = buildTxExplorerUrl(ARC_TESTNET_CHAIN_ID, txHash)
      toast.success('Transaction confirmed!', {
        action: { label: 'View', onClick: () => window.open(url, '_blank') },
      })
      onRefresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, txHash])

  // handlePayShare must be declared before the early return to keep hooks order consistent
  const handlePayShare = useCallback(async () => {
    if (!address || !bill) return
    // Pre-flight Tenderly simulation
    setSimStatus('running')
    const calldata = encodeFunctionData({
      abi: JANUS_SPLITTER.abi,
      functionName: 'payShare',
      args: [bill.billId],
    })
    const sim = await simulateTx({ from: address, to: JANUS_SPLITTER.address, data: calldata })
    setSimStatus('idle')
    if (!sim.success && !sim.mock) {
      toast.error(`Simulation: ${sim.error ?? 'Transaction would revert'}`)
      setSimStatus('warn')
      return
    }
    if (!sim.mock && sim.gasUsed > 0) {
      toast.info(`Estimated gas: ${sim.gasUsed.toLocaleString()}`, { duration: 2000 })
    }
    writeContract({
      address: JANUS_SPLITTER.address,
      abi: JANUS_SPLITTER.abi,
      functionName: 'payShare',
      args: [bill.billId],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }, [address, bill, writeContract])

  if (!bill) return null

  const descStr = bytes32ToString(bill.description)
  const isCreator = address?.toLowerCase() === bill.creator.toLowerCase()
  // oxlint-disable-next-line react/purity
  const nowSecs = Math.floor(Date.now() / 1000)
  const isExpired = Number(bill.deadline) < nowSecs
  const isFullyPaid = bill.amountPaid === bill.totalAmount
  const needsApproval = myShare > 0n && (!allowance || (allowance) < myShare)
  const progress = bill.totalAmount > 0n
    ? Number((bill.amountPaid * 100n) / bill.totalAmount)
    : 0

  const handleApprove = () => {
    approve({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [JANUS_SPLITTER.address, myShare],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  const handleSettle = () => {
    writeContract({
      address: JANUS_SPLITTER.address,
      abi: JANUS_SPLITTER.abi,
      functionName: 'settle',
      args: [bill.billId],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  const handleRefund = () => {
    writeContract({
      address: JANUS_SPLITTER.address,
      abi: JANUS_SPLITTER.abi,
      functionName: 'refund',
      args: [bill.billId],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  const handleCancel = () => {
    writeContract({
      address: JANUS_SPLITTER.address,
      abi: JANUS_SPLITTER.abi,
      functionName: 'cancel',
      args: [bill.billId],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  const handleFinalize = () => {
    writeContract({
      address: JANUS_SPLITTER.address,
      abi: JANUS_SPLITTER.abi,
      functionName: 'finalizeAfterDeadline',
      args: [bill.billId],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  const handleClaimRefund = () => {
    writeContract({
      address: JANUS_SPLITTER.address,
      abi: JANUS_SPLITTER.abi,
      functionName: 'claimRefund',
      args: [bill.billId],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} />
          <motion.section
            className="relative w-full max-w-md overflow-hidden rounded-t-2xl"
            style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', maxHeight: '85dvh', overflowY: 'auto' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={springs.sheet}
            onClick={e => e.stopPropagation()}
          >
            {/* Status accent bar */}
            <div className="h-1 sticky top-0 z-10"
              style={{ background: status === 'Open' ? 'var(--accent)' : status === 'Settled' ? 'var(--success)' : 'var(--border-strong)' }}
            />

            <div className="flex justify-center pt-3 pb-1 sticky top-1 z-10" style={{ background: 'var(--surface)' }}>
              <div className="h-1 w-10 rounded-full" style={{ background: 'var(--border-strong)' }} />
            </div>

            <div className="px-5 pb-8 pt-2">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>
                    {descStr || `Bill #${bill.billId.toString()}`}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    Bill #{bill.billId.toString()} · {status}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {status === 'Open' && (
                    <button
                      onClick={() => setShowQR(true)}
                      className="flex size-8 items-center justify-center rounded-full hover:bg-black/5 transition-colors"
                      title="Share QR code"
                    >
                      <QrCode className="size-4" style={{ color: 'var(--accent)' }} />
                    </button>
                  )}
                <button
                  onClick={onClose}
                  className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
                >
                  <X className="size-4" style={{ color: 'var(--muted)' }} />
                </button>
                </div>
              </div>

              {/* Hero amount */}
              <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div className="flex items-baseline gap-1 mb-3">
                  <span
                    className="text-4xl font-bold tabular-nums"
                    style={{ color: 'var(--ink)' }}
                  >
                    {formatUsdc(bill.totalAmount)}
                  </span>
                  <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>
                    USDC
                  </span>
                </div>

                {/* Progress */}
                <div className="h-2 rounded-full overflow-hidden mb-1" style={{ background: 'var(--border)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${progress}%`, background: progress === 100 ? 'var(--success)' : 'var(--accent)' }}
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                    {formatUsdc(bill.amountPaid)} / {formatUsdc(bill.totalAmount)} collected
                  </span>
                  <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {progress}%
                  </span>
                </div>
              </div>

              {/* Meta rows */}
              <div className="space-y-2 mb-4">
                {[
                  { label: 'Recipient', value: shortenAddr(bill.recipient) },
                  { label: 'Creator', value: shortenAddr(bill.creator) },
                  {
                    label: 'Deadline',
                    value: new Date(Number(bill.deadline) * 1000).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                    danger: isExpired && status === 'Open',
                  },
                ].map(row => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                      {row.label}
                    </span>
                    <span
                      className="text-xs font-medium mono"
                      style={{ color: row.danger ? 'var(--danger)' : 'var(--ink)' }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Participants list */}
              <div className="mb-5">
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
                  PARTICIPANTS
                </p>
                <div className="space-y-1.5">
                  {bill.participants.map((p, i) => (
                    <div
                      key={p}
                      className="flex items-center justify-between rounded-xl px-3 py-2"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ background: 'var(--accent)' }}
                        >
                          {i + 1}
                        </div>
                        <span className="text-xs mono" style={{ color: 'var(--ink)' }}>
                          {shortenAddr(p)}
                          {p.toLowerCase() === address?.toLowerCase() && (
                            <span className="ml-1" style={{ color: 'var(--accent-hover)' }}>
                              (you)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-semibold tabular-nums"
                          style={{ color: 'var(--ink)' }}
                        >
                          {formatUsdc(bill.shares[i])} USDC
                        </span>
                        <Clock className="size-3" style={{ color: 'var(--subtle)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* --- ACTIONS --- */}

              {/* Participant: pay share */}
              {status === 'Open' && isParticipant && !hasPaid && !isExpired && (
                <div className="space-y-2">
                  {needsApproval ? (
                    <TransactionButton
                      label={`Approve ${formatUsdc(myShare)} USDC`}
                      onClick={handleApprove}
                      isPending={approvePending}
                      isConfirming={approveConfirming}
                    />
                  ) : (
                    <TransactionButton
                      label={`Pay ${formatUsdc(myShare)} USDC`}
                      onClick={() => { void handlePayShare() }}
                      isPending={isPending}
                      isConfirming={isConfirming}
                    />
                  )}
                </div>
              )}

              {/* Participant already paid */}
              {status === 'Open' && isParticipant && !!hasPaid && (
                <div
                  className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold"
                  style={{ background: 'rgba(26,128,71,0.08)', color: 'var(--success)' }}
                >
                  <CheckCircle2 className="size-4" />
                  You've paid your share
                </div>
              )}

              {/* Fully paid — anyone can settle */}
              {status === 'Open' && isFullyPaid && (
                <TransactionButton
                  label="Settle Bill"
                  onClick={handleSettle}
                  isPending={isPending}
                  isConfirming={isConfirming}
                />
              )}

              {/* Creator actions after deadline */}
              {status === 'Open' && isCreator && isExpired && !isFullyPaid && (
                <div className="space-y-2">
                  {bill.amountPaid > 0n && (
                    <TransactionButton
                      label="Settle Partial"
                      onClick={handleSettle}
                      isPending={isPending}
                      isConfirming={isConfirming}
                    />
                  )}
                  <TransactionButton
                    label="Refund Participants"
                    onClick={handleRefund}
                    isPending={isPending}
                    isConfirming={isConfirming}
                  />
                </div>
              )}

              {/* Anyone can finalize after deadline */}
              {status === 'Open' && isExpired && !isCreator && (
                <TransactionButton
                  label="Finalize Expired Bill"
                  onClick={handleFinalize}
                  isPending={isPending}
                  isConfirming={isConfirming}
                />
              )}

              {/* Creator cancel (no payments) */}
              {status === 'Open' && isCreator && bill.amountPaid === 0n && !isExpired && (
                <button
                  onClick={handleCancel}
                  className="w-full mt-2 rounded-2xl py-3 text-xs font-semibold transition-colors hover:bg-red-50"
                  style={{ color: 'var(--danger)' }}
                >
                  Cancel Bill
                </button>
              )}

              {/* Claim refund */}
              {status === 'Refunded' && isParticipant && (
                <TransactionButton
                  label="Claim Refund"
                  onClick={handleClaimRefund}
                  isPending={isPending}
                  isConfirming={isConfirming}
                />
              )}

              {/* Tenderly sim status */}
              {simStatus === 'running' && (
                <div className="flex items-center justify-center gap-2 mt-2 py-1">
                  <Zap className="size-3 animate-pulse" style={{ color: 'var(--accent)' }} />
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    Simulating transaction...
                  </p>
                </div>
              )}

              {/* Explorer link */}
              <a
                href={`https://explorer.testnet.arc.io/address/${JANUS_SPLITTER.address}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1 mt-3 text-xs"
                style={{ color: 'var(--subtle)' }}
              >
                View contract <ExternalLink className="size-3" />
              </a>
            </div>
          </motion.section>
        </motion.div>
      )}

      {/* QR deep-link modal */}
      <QRModal
        open={showQR}
        bill={bill}
        myShare={myShare > 0n ? myShare : bill?.shares[0]}
        onClose={() => setShowQR(false)}
      />
    </AnimatePresence>
  )
}
