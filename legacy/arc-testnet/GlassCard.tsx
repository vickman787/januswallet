/**
 * Card primitives — flat MVP design system.
 */
import React from 'react'
import { clsx } from 'clsx'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}

// Kept as an object for backward compat — components spread glass.card as style
export const glass = {
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
  } as React.CSSProperties,
  inner: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
  } as React.CSSProperties,
  pill: {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: '100px',
  } as React.CSSProperties,
}

// Kept for BillCard/BillDetailSheet — now a plain accent bar
export const spectral = 'var(--accent)'

export const springs = {
  snappy: { type: 'spring', stiffness: 420, damping: 32 } as const,
  gentle: { type: 'spring', stiffness: 300, damping: 26 } as const,
  sheet: { type: 'spring', stiffness: 400, damping: 36 } as const,
}

export default function GlassCard({ children, className, style, onClick }: GlassCardProps) {
  return (
    <div
      className={clsx('p-4', className)}
      style={{ ...glass.card, ...style }}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
