/**
 * ActivityList — decoded wallet transaction history via Zerion API.
 */
// oxlint-disable react/set-state-in-effect -- network loading state is unavoidable for async hooks
import React from 'react'
import { ArrowUpRight, ArrowDownLeft, Repeat2, Loader2 } from 'lucide-react'
import { useActivity, type ZerionTx } from '@/hooks/useActivity'

interface Props { address: string | undefined }

function txIcon(type: string | undefined) {
  if (type === 'receive') return <ArrowDownLeft className="size-4" style={{ color: 'var(--success)' }} />
  if (type === 'send') return <ArrowUpRight className="size-4" style={{ color: 'var(--danger)' }} />
  return <Repeat2 className="size-4" style={{ color: 'var(--accent)' }} />
}

function txLabel(type: string | undefined) {
  if (type === 'receive') return 'Received'
  if (type === 'send') return 'Sent'
  if (type === 'trade') return 'Swapped'
  if (type === 'approve') return 'Approved'
  return type ?? 'Transaction'
}

function formatTs(ts: string | undefined) {
  if (!ts) return ''
  try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
  catch { return '' }
}

function TxRow({ tx }: { tx: ZerionTx }) {
  const attr = tx.attributes
  const type = attr?.operation_type
  const transfer = attr?.transfers?.[0]
  const symbol = transfer?.fungible_info?.symbol ?? 'Token'
  const qty = transfer?.quantity?.float
  const qtyStr = qty != null ? qty.toFixed(2) : ''

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <div
        className="flex size-8 items-center justify-center rounded-lg shrink-0"
        style={{ background: 'var(--surface-2)' }}
      >
        {txIcon(type)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{txLabel(type)}</p>
        <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{formatTs(attr?.mined_at)}</p>
      </div>
      {qtyStr && (
        <p className="text-sm font-semibold tabular-nums shrink-0" style={{ color: 'var(--ink)' }}>
          {qtyStr} {symbol}
        </p>
      )}
    </div>
  )
}

export default function ActivityList({ address }: Props) {
  const { transactions, loading, mock } = useActivity(address)

  if (!address) return null
  if (loading) return (
    <div className="flex justify-center py-8">
      <Loader2 className="size-5 animate-spin" style={{ color: 'var(--subtle)' }} />
    </div>
  )
  if (!transactions.length) return null

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          Recent Activity
        </p>
        {mock && (
          <span className="text-[10px]" style={{ color: 'var(--subtle)' }}>
            (Zerion key not configured)
          </span>
        )}
      </div>
      <div className="space-y-2">
        {transactions.slice(0, 5).map(tx => <TxRow key={tx.id} tx={tx} />)}
      </div>
    </section>
  )
}
