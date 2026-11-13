import { useJanusAuth } from '../auth/AccountProvider'
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Check, ChevronRight, ExternalLink,
  LockKeyhole, RotateCcw, ShieldCheck, ShoppingBag, SplitSquareVertical, Users, Wallet,
} from 'lucide-react'
import { JanusSymbol, JanusWordmark } from '../components/JanusLogo'
import InstallAppButton from '../components/InstallAppButton'

const studioUrl = 'https://studio.arc.io/app/1469922d-bfbd-40d1-af33-5f688469e811?thread=85b4f572-d861-4298-9c7a-74b1b2da9da4'
const demoUrl = 'https://youtu.be/dBig33jqzKc'

const features = [
  {
    Icon: ArrowUpRight,
    number: '01',
    title: 'Send & receive',
    description: 'Pay with an Arc wallet address or a verified JANUS username. Share your address or QR code to receive USDC.',
  },
  {
    Icon: SplitSquareVertical,
    number: '02',
    title: 'Split a bill',
    description: 'Give each person an exact share. When they pay, USDC goes straight to the recipient you chose.',
  },
  {
    Icon: ShoppingBag,
    number: '03',
    title: 'Fund a purchase',
    description: 'Invite contributors to pay flexible amounts into escrow. Release to the seller when the target is fully funded.',
  },
  {
    Icon: Users,
    number: '04',
    title: 'Bring your group',
    description: 'Create a group once, then add its accepted members to future splits and shared purchases.',
  },
]

export default function LandingScreen({ inApp = false, onOpenWallet }: { inApp?: boolean; onOpenWallet?: () => void }) {
  const auth = useJanusAuth()
  const openWallet = inApp ? onOpenWallet : auth.login
  const waitingForAuth = !inApp && (!auth.configured || !auth.ready)

  return (
    <div className="landing-page min-h-dvh overflow-hidden">
      <div className="landing-glow" aria-hidden="true" />
      <header className="landing-header relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <JanusWordmark size={33} />
        {!inApp && <nav aria-label="Landing navigation" className="hidden items-center gap-7 text-sm text-[#AAB5C5] md:flex">
          <a href="#features" className="hover:text-white">Features</a>
          <a href="#payment-paths" className="hover:text-white">Split vs Purchase</a>
          <a href={demoUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white">Watch demo</a>
        </nav>}
        {inApp && <button type="button" onClick={openWallet}
          className="landing-header-cta inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/15 px-4 text-sm font-semibold text-white transition-colors hover:border-[#8B9DFF] hover:bg-white/5">
          Back to wallet <ArrowRight size={16} />
        </button>}
      </header>

      <main className="relative z-10">
        <section className="landing-hero mx-auto grid w-full max-w-7xl items-center gap-10 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[minmax(0,1.03fr)_minmax(0,.97fr)] lg:gap-14 lg:pb-28 lg:pt-20">
          <div className="max-w-2xl">
            <div className="landing-kicker mb-6 inline-flex items-center gap-2 rounded-full border border-[#6074D8]/30 bg-[#4D6BFF]/10 px-4 py-2 text-xs font-semibold tracking-wide text-[#C4CDFF]">
              <span className="h-2 w-2 rounded-full bg-[#41D6A4] shadow-[0_0_12px_#41D6A4]" /> Live on Arc Mainnet
            </div>
            <h1 className="display landing-hero-title text-balance font-semibold text-white">
              Money moves better <span>together.</span>
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-[#AAB5C5] sm:text-lg sm:leading-8">
              Meet the wallet for shared USDC payments. Send to a username, split an exact bill, or collect flexible contributions for a purchase—all on Arc.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {!inApp && <button type="button" onClick={openWallet} disabled={waitingForAuth}
                className="landing-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-white disabled:opacity-50">
                {auth.ready ? 'Get started' : 'Preparing sign in…'} <ArrowRight size={17} />
              </button>}
              <a href={demoUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-semibold text-[#DDE4F0] transition-colors hover:bg-white/5">
                Watch the demo <ExternalLink size={15} />
              </a>
            </div>
            {!inApp && !auth.configured && <p role="status" className="mt-3 text-sm text-amber-200">Sign in is temporarily unavailable.</p>}
            {!inApp && <div className="mt-5 flex items-center"><InstallAppButton compact /></div>}
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-[#8F9EB2]">
              <span className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-[#82E4C0]" /> Arc Mainnet USDC</span>
              <span className="inline-flex items-center gap-2"><LockKeyhole size={15} className="text-[#9DADFF]" /> Escrow for shared purchases</span>
            </div>
          </div>

          <div className="landing-preview-wrap relative mx-auto w-full max-w-[540px]" aria-label="Illustrative preview of JANUS wallet">
            <div className="landing-preview-halo" aria-hidden="true" />
            <div className="landing-preview relative overflow-hidden rounded-[28px] border border-[#39485D] p-4 shadow-2xl sm:p-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3"><JanusSymbol size={34} /><div><p className="display text-sm font-semibold tracking-wide">JANUS</p><p className="text-[11px] text-[#91A0B4]">Illustrative wallet preview</p></div></div>
                <span className="rounded-full border border-[#42CC9D]/25 bg-[#42CC9D]/10 px-2.5 py-1 text-[10px] font-semibold text-[#84E5BE]">ARC MAINNET</span>
              </div>
              <div className="landing-preview-balance mt-5 rounded-[22px] border border-[#42536B] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-[#B1BED0]">Available USDC</p><p className="mt-3 display text-4xl font-semibold tracking-tight text-white sm:text-5xl">128.40 <span className="text-base font-medium text-[#AAB7C8]">USDC</span></p></div><Wallet size={19} className="text-[#C3CDFF]" /></div>
                <div className="mt-7 flex items-center justify-between border-t border-white/10 pt-4 text-xs"><span className="text-[#96A6BB]">Payment wallet</span><span className="mono text-[#D5DEEF]">0x72A4…89F2</span></div>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {([
                  { label: 'Send', Icon: ArrowUpRight }, { label: 'Receive', Icon: ArrowDownLeft },
                  { label: 'Split', Icon: SplitSquareVertical }, { label: 'Purchase', Icon: ShoppingBag },
                ] as const).map(({ label, Icon }) => <div key={label} className="landing-preview-action flex flex-col items-center justify-center gap-2 rounded-xl border border-white/10 py-3 text-[11px] font-semibold text-[#DCE5F2]"><Icon size={18} className="text-[#A7B6FF]" />{label}</div>)}
              </div>
              <div className="mt-6 flex items-center justify-between text-xs"><p className="font-semibold text-white">Recent activity</p><span className="text-[#A8B8FF]">View all <ChevronRight size={12} className="inline" /></span></div>
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4D6BFF]/15 text-[#A7B6FF]"><SplitSquareVertical size={17} /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold">Dinner split</p><p className="mt-0.5 text-[11px] text-[#9CAABE]">Paid directly to recipient</p></div><span className="text-xs font-semibold">-18.00</span></div>
            </div>
            <div className="landing-floating-note absolute -bottom-4 -right-1 rounded-2xl border border-[#496077] px-4 py-3 shadow-xl sm:-right-5"><p className="text-[10px] uppercase tracking-[.14em] text-[#9BAFC5]">Shared purchase</p><p className="mt-1 flex items-center gap-2 text-xs font-semibold text-white"><Check size={15} className="text-[#55D8A7]" /> Target funded</p></div>
          </div>
        </section>

        <section id="features" className="landing-section mx-auto w-full max-w-7xl px-5 pb-20 sm:px-8 lg:pb-28">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="landing-overline">ONE WALLET, MORE WAYS TO PAY</p><h2 className="display mt-3 max-w-xl text-3xl font-semibold text-white sm:text-4xl">From a quick transfer to a group plan.</h2></div><p className="max-w-sm text-sm leading-6 text-[#9CAABE]">Move Arc USDC with a clear path for every kind of shared payment.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ Icon, number, title, description }) => <article key={number} className="landing-feature rounded-[22px] border border-white/10 p-5">
              <div className="flex items-start justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#7186FF]/25 bg-[#4D6BFF]/10 text-[#A9B8FF]"><Icon size={21} /></span><span className="mono text-xs text-[#5F6D82]">{number}</span></div>
              <h3 className="display mt-9 text-lg font-semibold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-[#9FADBF]">{description}</p>
            </article>)}
          </div>
        </section>

        <section id="payment-paths" className="landing-section landing-paths border-y border-white/10 py-20 lg:py-24">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-8"><p className="landing-overline">THE IMPORTANT DIFFERENCE</p><h2 className="display mt-3 text-3xl font-semibold text-white sm:text-4xl">Choose when the recipient gets paid.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-[#AAB5C5]">Split and Purchase both bring people together. They move money differently.</p>
            <div className="mt-9 grid gap-4 md:grid-cols-2">
              <article className="landing-path-card rounded-[24px] border border-[#4D6BFF]/30 p-6 sm:p-7"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4D6BFF]/15 text-[#B4C0FF]"><SplitSquareVertical size={21} /></span><h3 className="display mt-6 text-2xl font-semibold">Split</h3><p className="mt-2 text-sm leading-6 text-[#AAB5C5]">Set exact shares for a bill. Each completed payment goes directly to the saved recipient.</p><div className="landing-path-line mt-7 flex items-center justify-between gap-2 text-[11px] font-semibold text-[#D8E0F0]"><span>PAYER</span><ArrowRight size={18} className="text-[#9CADFF]" /><span>RECIPIENT</span></div><p className="mt-5 text-xs text-[#91A1B5]">Best when the amount per person is known.</p></article>
              <article className="landing-path-card rounded-[24px] border border-[#43CDA3]/25 p-6 sm:p-7"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#41D6A4]/10 text-[#83E5C3]"><ShoppingBag size={21} /></span><h3 className="display mt-6 text-2xl font-semibold">Purchase</h3><p className="mt-2 text-sm leading-6 text-[#AAB5C5]">Collect flexible contributions in escrow. After full funding, the organizer releases USDC to the saved seller or recipient.</p><div className="landing-path-line mt-7 flex items-center justify-between gap-2 text-[11px] font-semibold text-[#D8E0F0]"><span>CONTRIBUTORS</span><ArrowRight size={18} className="text-[#83E5C3]" /><span>ESCROW</span><ArrowRight size={18} className="text-[#83E5C3]" /><span>SELLER</span></div><p className="mt-5 flex items-start gap-2 text-xs text-[#91A1B5]"><RotateCcw size={14} className="shrink-0 text-[#83E5C3]" /> If cancelled or expired, contributors claim their own refunds.</p></article>
            </div>
          </div>
        </section>

      </main>

      <footer className="relative z-10 border-t border-white/10 px-5 py-7 text-xs text-[#8B99AA] sm:px-8"><div className="mx-auto flex w-full max-w-7xl flex-col justify-between gap-4 sm:flex-row sm:items-center"><JanusWordmark size={24} /><p>Shared payments on Arc Mainnet.</p><a href={studioUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[#B5C1FF] hover:text-white">Built with Arc Studio <ExternalLink size={13} /></a></div></footer>
    </div>
  )
}
