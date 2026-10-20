import React from 'react'
import { Clock, CheckCircle2, RotateCcw, XCircle, Users } from 'lucide-react'
import { billStatusLabel, formatUsdc, bytes32ToString, type BillStatus } from '@/contracts'

const MODULE_NOW_SECS = Math.floor(Date.now() / 1000)

export interface BillData {
  billId: bigint
  creator: string
  recipient: string
  totalAmount: bigint
  amountPaid: bigint
  deadline: bigint
  status: number
  description: string
  participants: readonly string[]
  shares: readonly bigint[]
}

const STATUS_CONFIG: Record<BillStatus, { icon: React.ReactNode; color: string; bg: string }> = {
  Open:      { icon: <Clock className="size-3" />,         color: '#2563eb', bg: '#eff6ff' },
  Settled:   { icon: <CheckCircle2 className="size-3" />,  color: '#16a34a', bg: '#f0fdf4' },
  Refunded:  { icon: <RotateCcw className="size-3" />,     color: '#64748b', bg: '#f1f5f9' },
  Cancelled: { icon: <XCircle className="size-3" />,       color: '#dc2626', bg: '#fef2f2' },
}

interface BillCardProps {
  bill: BillData
  connectedAddress?: string
  onClick: () => void
  index?: number
}

export default function BillCard({ bill, connectedAddress, onClick }: BillCardProps) {
  const status = billStatusLabel(bill.status)
  const cfg = STATUS_CONFIG[status]
  const desc = bytes32ToString(bill.description)
  const progress = bill.totalAmount > 0n
    ? Number((bill.amountPaid * 100n) / bill.totalAmount)
    : 0
  const isCreator = connectedAddress?.toLowerCase() === bill.creator.toLowerCase()
  const isParticipant = bill.participants.some(p => p.toLowerCase() === connectedAddress?.toLowerCase())
  const role = isCreator ? 'Creator' : isParticipant ? 'Participant' : null
  const isExpired = Number(bill.deadline) < MODULE_NOW_SECS && status === 'Open'
  const deadline = new Date(Number(bill.deadline) * 1000)

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border p-4 transition-colors hover:bg-gray-50 active:bg-gray-100"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>
              {desc || `Bill #${bill.billId.toString()}`}
            </p>
            {role && (
              <span
                className="badge shrink-0"
                style={{
                  background: isCreator ? 'var(--surface-2)' : 'var(--accent-light)',
                  color: isCreator ? 'var(--muted)' : 'var(--accent)',
                }}
              >
                {role}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--muted)' }}>
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {bill.participants.length}
            </span>
            <span
              className="flex items-center gap-1"
              style={{ color: isExpired ? 'var(--danger)' : 'var(--subtle)' }}
            >
              <Clock className="size-3" />
              {isExpired ? 'Expired' : deadline.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Right */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <p className="font-bold text-base tabular-nums" style={{ color: 'var(--ink)' }}>
            ${formatUsdc(bill.totalAmount)}
          </p>
          <span className="badge" style={{ background: cfg.bg, color: cfg.color }}>
            {cfg.icon}
            {status}
          </span>
        </div>
      </div>

      {/* Progress bar — only for Open bills with any payment */}
      {status === 'Open' && bill.totalAmount > 0n && (
        <div className="mt-3">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress}%`,
                background: progress === 100 ? 'var(--success)' : 'var(--accent)',
              }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[10px] tabular-nums" style={{ color: 'var(--subtle)' }}>
            <span>${formatUsdc(bill.amountPaid)} paid</span>
            <span>{progress}%</span>
          </div>
        </div>
      )}
    </button>
  )
}
