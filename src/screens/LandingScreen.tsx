import { useJanusAuth } from '../auth/AccountProvider'

import { ArrowRight, Shield, Users, Zap, RotateCcw } from 'lucide-react'
import { JanusSymbol, JanusWordmark } from '../components/JanusLogo'

const features = [
  {
    Icon: Zap,
    title: 'Send & Receive',
    status: 'Live',
    desc: 'Send Arc USDC using a verified JANUS username or wallet address. Receive with your wallet address or QR code.',
  },
  {
    Icon: Users,
    title: 'Split Bills',
    status: 'Live',
    desc: 'Divide a total into exact shares. Assign named shares to verified JANUS accounts or create open shares and share one payment link.',
  },
  {
    Icon: Shield,
    title: 'Shared Purchases',
    status: 'Live',
    desc: 'Create Arc Mainnet USDC escrow purchases, invite verified JANUS participants, collect contributions, and release fully funded purchases to the recipient.',
  },
  {
    Icon: RotateCcw,
    title: 'Contributor Refunds',
    status: 'Live',
    desc: 'After organizer cancellation or underfunded expiry, each contributor can claim their own Arc USDC refund from escrow.',
  },
]

export default function LandingScreen({ inApp = false, onOpenWallet }: { inApp?: boolean; onOpenWallet?: () => void }) {
  const auth = useJanusAuth()
  return (
    <div
      className={inApp ? "flex flex-col" : "min-h-dvh flex flex-col"}
      style={{ background: '#0B0D12' }}
    >
      {/* Header */}
      {!inApp && <header className="flex items-center px-5 py-4">
        <JanusWordmark size={28} />
      </header>}

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 pt-12 pb-10">
        {/* Network badge — top of hero */}
        <div
          className="flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-8"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#77808F',
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#22C55E' }} />
          Arc Mainnet
        </div>

        <div className="mb-8">
          <JanusSymbol size={88} />
        </div>

        <h1
          className="display font-bold mb-3 text-balance"
          style={{
            fontSize: 'clamp(2rem, 8vw, 3rem)',
            color: '#F1F3F2',
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}
        >
          Shared payments.
          <br />
          <span style={{ color: '#4D6BFF' }}>Safe settlement.</span>
        </h1>

        <p
          className="text-base max-w-lg text-pretty mb-8"
          style={{ color: '#77808F', lineHeight: 1.6 }}
        >
          Send Arc USDC, split bills, and fund shared purchases using verified JANUS accounts or wallet addresses.
          Escrow handles releases and contributor-claimed refunds on Arc Mainnet.
        </p>

        <button onClick={inApp ? onOpenWallet : auth.login} disabled={!inApp && (!auth.configured || !auth.ready)}
          className="flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-base bg-[#4D6BFF] text-white disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[#4D6BFF] active:scale-95 min-h-12">
          {inApp ? 'Open wallet' : auth.ready ? 'Get started' : 'Preparing sign in…'}<ArrowRight size={18} />
        </button>
        {!inApp && !auth.configured && <p role="status" className="mt-3 text-sm text-[#A8B0BE]">Sign in is temporarily unavailable.</p>}
      </section>

      {/* How it works */}
      <section className="px-5 pb-8 max-w-3xl mx-auto w-full">
        <h2
          className="display font-semibold text-xs uppercase mb-5 tracking-widest"
          style={{ color: '#77808F', letterSpacing: '0.1em' }}
        >
          How JANUS works
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {features.map(({ Icon, title, status, desc }) => (
            <div
              key={title}
              className="flex items-start gap-4 rounded-xl p-4"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <span
                className="flex-shrink-0 flex items-center justify-center rounded-lg mt-0.5"
                style={{
                  width: 36,
                  height: 36,
                  background: 'rgba(77,107,255,0.12)',
                  border: '1px solid rgba(77,107,255,0.2)',
                }}
              >
                <Icon size={18} style={{ color: '#4D6BFF' }} strokeWidth={1.8} />
              </span>
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-sm" style={{ color: '#F1F3F2' }}>{title}</p>
                  <span className={status !== 'Planned' ? 'rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300' : 'rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#A8B0BE]'}>{status}</span>
                </div>
                <p className="text-sm" style={{ color: '#77808F', lineHeight: 1.5 }}>
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="px-5 py-6 text-center text-xs text-[#A8B0BE]"><a href="https://studio.arc.io/app/1469922d-bfbd-40d1-af33-5f688469e811?thread=85b4f572-d861-4298-9c7a-74b1b2da9da4" target="_blank" rel="noopener noreferrer">Built with Arc Studio</a></footer>
    </div>
  )
}
