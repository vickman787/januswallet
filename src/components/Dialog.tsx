import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export default function Dialog({ children, onClose, label, busy = false }: {
  children: ReactNode; onClose: () => void; label: string; busy?: boolean
}) {
  const panel = useRef<HTMLElement>(null)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => {
      const target = panel.current?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')
      ;(target ?? panel.current)?.focus()
    })
    return () => {
      cancelAnimationFrame(frame)
      previous?.focus()
    }
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (!busy) onClose()
      return
    }
    if (event.key !== 'Tab' || !panel.current) return
    const focusable = [...panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')]
    if (!focusable.length) { event.preventDefault(); panel.current.focus(); return }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 px-3 py-4 backdrop-blur-sm"
      onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section ref={panel} role="dialog" aria-modal="true" aria-label={label} aria-busy={busy} tabIndex={-1}
        onKeyDown={handleKeyDown} className="janus-dialog outline-none">
        <div className="p-5 sm:p-6">{children}</div>
      </section>
    </div>,
    document.body,
  )
}