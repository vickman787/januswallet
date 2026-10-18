import { ConnectKitButton } from 'connectkit'
import { ArrowRight, Shield, Users, Zap, RotateCcw } from 'lucide-react'
import { JanusSymbol, JanusWordmark } from '../components/JanusLogo'

interface LandingScreenProps {
  onEnterApp: () => void
}

const features = [
  {
    Icon: Zap,
    title: 'Send & Receive',
    desc: 'Transfer USDC instantly to anyone on Arc. No ETH needed for gas.',
  },
  {
    Icon: Users,
    title: 'Split Bills',
    desc: 'Named or open splits — share a link, collect from everyone, settle instantly.',
  },
  {
    Icon: Shield,
    title: 'Shared Purchases',
    desc: 'Fund a purchase together. Contributions stay in escrow until the organizer releases funds.',
  },
  {
    Icon: RotateCcw,
    title: 'Safe Refunds',
    desc: 'If a purchase is cancelled or expires, contributors can claim their money back.',
  },
]

export default function LandingScreen({ onEnterApp }: LandingScreenProps) {
  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{ background: '#0B0D12' }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4">
        <JanusWordmark size={28} />
        <ConnectKitButton.Custom>
          {({ isConnected, show }) => (
            <button
              onClick={() => { show?.(); }}
              className="text-sm font-medium px-4 py-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
              style={{
                background: isConnected ? 'rgba(77,107,255,0.12)' : 'transparent',
                color: '#C8CDD6',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              {isConnected ? 'Open wallet' : 'Sign in'}
            </button>
          )}
        </ConnectKitButton.Custom>
      </header>

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
          className="text-base max-w-sm text-pretty mb-8"
          style={{ color: '#77808F', lineHeight: 1.6 }}
        >
          Send money, split bills, and fund shared purchases together — with
          clear escrow, refund rules, and instant USDC on Arc.
        </p>

        <ConnectKitButton.Custom>
          {({ isConnected, show }) => (
            <button
              onClick={() => {
                if (isConnected) {
                  onEnterApp()
                } else {
                  show?.()
                }
              }}
              className="flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-base transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF] active:scale-95"
              style={{
                background: '#4D6BFF',
                color: '#fff',
                boxShadow: '0 0 32px rgba(77,107,255,0.25)',
                minHeight: '48px',
              }}
            >
              {isConnected ? 'Open wallet' : 'Get started'}
              <ArrowRight size={18} />
            </button>
          )}
        </ConnectKitButton.Custom>
      </section>

      {/* How it works */}
      <section className="px-5 pb-8 max-w-md mx-auto w-full">
        <h2
          className="display font-semibold text-xs uppercase mb-5 tracking-widest"
          style={{ color: '#77808F', letterSpacing: '0.1em' }}
        >
          How JANUS works
        </h2>

        <div className="flex flex-col gap-3">
          {features.map(({ Icon, title, desc }) => (
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
                <p className="font-semibold text-sm mb-0.5" style={{ color: '#F1F3F2' }}>
                  {title}
                </p>
                <p className="text-sm" style={{ color: '#77808F', lineHeight: 1.5 }}>
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>


    </div>
  )
}
