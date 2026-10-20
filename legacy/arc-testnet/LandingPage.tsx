import React from 'react'
import { ConnectKitButton } from 'connectkit'
import { Zap, Users, ShieldCheck, ArrowRight, SplitSquareHorizontal } from 'lucide-react'

const features = [
  {
    icon: <Zap className="size-5" />,
    title: 'Instant settlement',
    desc: 'Bills settle in under a second on Arc. No waiting, no delays, no chasing friends.',
  },
  {
    icon: <Users className="size-5" />,
    title: 'Group splits, made simple',
    desc: 'Set a total, add participants, and Janus calculates each share automatically.',
  },
  {
    icon: <ShieldCheck className="size-5" />,
    title: 'USDC — not funny money',
    desc: 'Settle in actual USDC. What you send is what they receive, every time.',
  },
]

const steps = [
  { n: '1', label: 'Create a bill', sub: 'Set a title, total amount, and add participant wallet addresses.' },
  { n: '2', label: 'Share the link', sub: 'Each participant gets a QR code or deep-link to open and pay their share.' },
  { n: '3', label: 'Settled instantly', sub: 'Once everyone pays, the recipient gets the full amount — no middlemen.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>

      {/* Nav */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-5 py-3 border-b"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex size-8 items-center justify-center rounded-lg text-white text-sm font-bold"
            style={{ background: 'var(--accent)' }}
          >
            J
          </div>
          <span className="font-bold text-base" style={{ color: 'var(--ink)' }}>Janus</span>
          <span
            className="badge"
            style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
          >
            Arc Testnet
          </span>
        </div>
        <ConnectKitButton />
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-5 pt-16 pb-12 mx-auto max-w-xl w-full">
        <div
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold mb-6 border"
          style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderColor: 'var(--accent)' }}
        >
          <Zap className="size-3" />
          Built on Arc — USDC as gas
        </div>

        <h1
          className="text-4xl font-extrabold leading-tight tracking-tight mb-4"
          style={{ color: 'var(--ink)' }}
        >
          Split bills.<br />
          Settle instantly.
        </h1>

        <p className="text-base mb-8 max-w-sm" style={{ color: 'var(--muted)' }}>
          Janus is the fastest way to split group expenses and settle in USDC — no banks, no delays, no awkward IOUs.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <ConnectKitButton />
          <a
            href="#how-it-works"
            className="flex items-center gap-1.5 text-sm font-medium"
            style={{ color: 'var(--muted)' }}
          >
            See how it works
            <ArrowRight className="size-3.5" />
          </a>
        </div>
      </section>

      {/* Mock app preview */}
      <section className="px-5 pb-14 mx-auto max-w-sm w-full">
        <div
          className="rounded-2xl border overflow-hidden shadow-sm"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {/* Fake nav bar */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-1.5">
              <div
                className="size-2.5 rounded-full"
                style={{ background: 'var(--accent)' }}
              />
              <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Janus</span>
            </div>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>0x1a2b…3c4d</span>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 p-3">
            <div
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              <SplitSquareHorizontal className="size-3.5" /> New Bill
            </div>
            <div
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
            >
              Send USDC
            </div>
          </div>

          {/* Mock bill cards */}
          {[
            { title: 'Dinner at Nobu', amount: '120.00', paid: '80.00', status: 'Open', pct: 67, participants: 3 },
            { title: 'AirBnb split', amount: '340.00', paid: '340.00', status: 'Settled', pct: 100, participants: 4 },
          ].map(b => (
            <div
              key={b.title}
              className="mx-3 mb-3 rounded-xl border p-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{b.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{b.participants} participants</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{ color: 'var(--ink)' }}
                  >
                    ${b.amount}
                  </span>
                  <span
                    className="badge"
                    style={
                      b.status === 'Settled'
                        ? { background: 'var(--success-light)', color: 'var(--success)' }
                        : { background: 'var(--accent-light)', color: 'var(--accent)' }
                    }
                  >
                    {b.status}
                  </span>
                </div>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: 'var(--surface-2)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${b.pct}%`,
                    background: b.status === 'Settled' ? 'var(--success)' : 'var(--accent)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-5 pb-14 mx-auto max-w-xl w-full">
        <h2 className="text-xl font-bold text-center mb-6" style={{ color: 'var(--ink)' }}>
          Why Janus?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {features.map(f => (
            <div
              key={f.title}
              className="rounded-xl border p-4"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div
                className="flex size-9 items-center justify-center rounded-lg mb-3"
                style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
              >
                {f.icon}
              </div>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>{f.title}</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="px-5 pb-16 mx-auto max-w-xl w-full">
        <h2 className="text-xl font-bold text-center mb-6" style={{ color: 'var(--ink)' }}>
          How it works
        </h2>
        <div className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-start gap-4">
              <div
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white mt-0.5"
                style={{ background: 'var(--accent)' }}
              >
                {s.n}
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{s.label}</p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--muted)' }}>{s.sub}</p>
              </div>
              {i < steps.length - 1 && (
                <div
                  className="absolute left-[18px] mt-8 w-px h-8 ml-px"
                  style={{ background: 'var(--border)' }}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="px-5 pb-16 mx-auto max-w-xl w-full">
        <div
          className="rounded-2xl border p-8 flex flex-col items-center text-center"
          style={{ background: 'var(--accent-light)', borderColor: 'var(--accent)' }}
        >
          <p className="text-lg font-bold mb-2" style={{ color: 'var(--accent)' }}>
            Ready to split your first bill?
          </p>
          <p className="text-sm mb-5" style={{ color: 'var(--accent)' }}>
            Connect your wallet — it only takes seconds.
          </p>
          <ConnectKitButton />
        </div>
      </section>

      {/* Footer */}
      <footer
        className="mt-auto border-t px-5 py-6 text-center"
        style={{ borderColor: 'var(--border)' }}
      >
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Janus runs on{' '}
          <a
            href="https://arc.io"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={{ color: 'var(--accent)' }}
          >
            Arc Testnet
          </a>
          {' '}— where USDC is the native gas token. All transactions are testnet only.
        </p>
      </footer>
    </div>
  )
}
