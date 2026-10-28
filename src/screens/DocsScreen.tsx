import { useState } from 'react'
import { ArrowLeft, ArrowUpRight, BookOpen, Play } from 'lucide-react'

type Topic = {
  id: string
  title: string
  summary: string
  points: { title: string; body: string }[]
}

const topics: Topic[] = [
  {
    id: 'compare', title: 'Split vs Purchase',
    summary: 'Choose based on when the recipient should receive USDC. A Split sends exact shares directly; a Purchase holds flexible contributions in escrow.',
    points: [
      { title: 'Where does the money go?', body: 'Split: each payer sends USDC directly to the saved recipient. Purchase: contributions stay in the JanusPurchase contract until release or refund.' },
      { title: 'How much can one person pay?', body: 'Split: a payer covers their exact assigned or open share. Purchase: a contributor chooses any positive amount up to the remaining target. One wallet can fund the whole purchase.' },
      { title: 'Who can participate?', body: 'Split: named shares belong to their assigned JANUS accounts; open shares can be claimed through a link. Purchase: invited accounts see it in Inbox, but anyone with the purchase ID can contribute on-chain.' },
      { title: 'What if others do not pay?', body: 'Split: direct payments already sent remain with the recipient. Purchase: underfunded escrow can be marked expired after the funding deadline, then each contributor claims a refund.' },
      { title: 'Can the recipient be changed?', body: 'Choose the recipient before creating either flow. JANUS has no user-facing recipient edit after a split is created; the purchase recipient is fixed on-chain.' },
    ],
  },
  {
    id: 'send', title: 'Send & receive',
    summary: 'Direct USDC payments on Arc Mainnet.',
    points: [
      { title: 'Send', body: 'Enter a verified JANUS username or wallet address and an amount. Review the resolved wallet before confirming the direct transfer.' },
      { title: 'Receive', body: 'Share your Arc wallet address or QR code. The QR contains the address; the sender must still select the correct network and token.' },
      { title: 'After confirmation', body: 'JANUS cannot cancel or refund a confirmed direct transfer. Check both the JANUS review and your wallet prompt.' },
    ],
  },
  {
    id: 'wallets', title: 'Wallets & usernames',
    summary: 'One JANUS account can use multiple wallets, but its username has one receiving address.',
    points: [
      { title: 'Connect another wallet', body: 'In Settings, choose Connect another wallet and connect the wallet you control. Select it under Active payment wallet, switch to Arc Mainnet, then verify it in your JANUS profile by signing a message. The verification signature does not send USDC.' },
      { title: 'What does the active wallet do?', body: 'The active payment wallet is the wallet JANUS uses to sign and send transactions. Each connected wallet keeps its own USDC balance; connecting or switching wallets does not move funds between them.' },
      { title: 'Where does @username receive money?', body: 'A JANUS username resolves to the account’s first verified Arc wallet. Payments sent to @username go to that wallet even if a different wallet is currently active.' },
      { title: 'How does the second wallet receive?', body: 'Share the second wallet’s full address when you want a payment sent there. Ask the sender to check the resolved destination before confirming. Switching the active wallet does not redirect payments addressed to @username.' },
      { title: 'Can each wallet have a different username?', body: 'Wallets linked to one JANUS account share that account’s username. A second username requires a separate JANUS account, and a verified wallet cannot be registered to two accounts.' },
    ],
  },
  {
    id: 'split', title: 'Split a bill',
    summary: 'Exact shares paid directly to one recipient.',
    points: [
      { title: 'Create a split', body: 'Add a title, total and pay recipient. The recipient starts as your wallet, but you can change it to another verified JANUS username or wallet before creation.' },
      { title: 'Named or open', body: 'Named splits assign exact shares to verified accounts and can include accepted group members. Open splits create a chosen number of shares to claim through a link.' },
      { title: 'Pay a share', body: 'Each payer transfers their share directly to the saved recipient. JANUS records the confirmed transfer; there is no escrow or JANUS-managed refund.' },
    ],
  },
  {
    id: 'purchase', title: 'Shared purchases',
    summary: 'Flexible contributions held in escrow.',
    points: [
      { title: 'Create', body: 'Set a recipient, target amount, funding deadline and later release deadline. These on-chain terms are fixed at creation. Invite verified JANUS accounts, or add accepted group members.' },
      { title: 'Contribute', body: 'Choose any positive amount up to the remaining target. One wallet, including the organizer, may fund it all. Invitations help people find it in Inbox; they do not restrict on-chain contributions.' },
      { title: 'Release', body: 'At full funding, the purchase becomes Funded. Only the organizer can release the escrowed USDC to the saved recipient before the release deadline.' },
    ],
  },
  {
    id: 'refunds', title: 'Deadlines & refunds',
    summary: 'When escrowed contributions can be returned.',
    points: [
      { title: 'Cancellation', body: 'The organizer can cancel a purchase while it is Funding or Funded, before release. Each contributor then claims their own contribution from escrow.' },
      { title: 'Underfunded expiry', body: 'Once the funding deadline passes without reaching the target, anyone can submit the on-chain expiry action. Contributors can claim after that transaction confirms.' },
      { title: 'Unreleased expiry', body: 'If a fully funded purchase is not released by the release deadline, anyone can mark it Expired. Contributors can then claim their own refunds.' },
      { title: 'No automatic payout', body: 'A deadline passing alone does not send money back. Expiry must be marked on-chain, and each contributor must claim with their wallet.' },
    ],
  },
  {
    id: 'groups', title: 'Groups & Inbox',
    summary: 'Invite people and track their requests.',
    points: [
      { title: 'Groups', body: 'Invite verified JANUS accounts. Accepted members can be added together to a new named split or purchase; you can still edit the participant list before creation.' },
      { title: 'Membership', body: 'The organizer can add or remove members, and an accepted member can leave. Group changes do not rewrite existing splits or purchases.' },
      { title: 'Inbox', body: 'Find invitations, assigned split shares and purchase updates. Open an item to review the details before paying or claiming a refund.' },
    ],
  },
  {
    id: 'safety', title: 'Before you confirm',
    summary: 'Review the network, amount and recipient.',
    points: [
      { title: 'Check the network', body: 'These payment flows use Arc Mainnet USDC. Review the network in your wallet before approving a transaction.' },
      { title: 'Read the wallet prompt', body: 'Confirm the action, recipient and USDC amount. A purchase approval and the contribution itself are separate transactions.' },
      { title: 'Check pending payments', body: 'Wait for confirmation and use the transaction link to verify what happened on-chain. Do not repeat a pending payment until its status is clear.' },
    ],
  },
]

export default function DocsScreen({ onBack }: { onBack: () => void }) {
  const [topicId, setTopicId] = useState('compare')
  const [playing, setPlaying] = useState(false)
  const topic = topics.find(item => item.id === topicId) ?? topics[0]

  return <div className="space-y-5 p-4 pb-8">
    <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 text-sm text-[#9BAEFF]"><ArrowLeft size={17} />Back to wallet</button>
    <div className="flex items-start gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#4D6BFF]/30 bg-[#4D6BFF]/10 text-[#9BAEFF]"><BookOpen size={22} /></span>
      <div><h1 className="display text-2xl font-semibold">Docs</h1><p className="mt-1 text-sm leading-relaxed text-[#A8B0BE]">Understand how JANUS moves USDC before you confirm a payment.</p></div>
    </div>

    <section className="janus-panel overflow-hidden" aria-labelledby="docs-video-heading">
      <div className="p-4"><h2 id="docs-video-heading" className="display font-semibold">JANUS Wallet demo</h2><p className="mt-1 text-sm text-[#A8B0BE]">Watch the app walkthrough, then read the guides below for exact payment rules.</p></div>
      {playing ? <div className="aspect-video bg-black"><iframe className="h-full w-full" src="https://www.youtube-nocookie.com/embed/dBig33jqzKc?autoplay=1&rel=0" title="JANUS Wallet demo video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>
        : <button type="button" onClick={() => setPlaying(true)} aria-label="Play JANUS Wallet demo video" className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#151D34] via-[#0C1221] to-[#0B0D12]"><span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#9BAEFF]/40 bg-[#4D6BFF]/20 text-[#9BAEFF]"><Play size={26} fill="currentColor" /></span><span className="text-sm font-semibold">Play demo</span></button>}
      <div className="px-4 py-3"><a href="https://youtu.be/dBig33jqzKc" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#9BAEFF] underline">Open on YouTube <ArrowUpRight size={15} /></a></div>
    </section>

    <nav aria-label="Documentation topics" className="flex gap-2 overflow-x-auto pb-1">
      {topics.map(item => <button key={item.id} type="button" onClick={() => setTopicId(item.id)} aria-current={topicId === item.id ? 'page' : undefined} className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors ${topicId === item.id ? 'border-[#4D6BFF]/60 bg-[#4D6BFF]/15 text-[#F1F3F2]' : 'border-white/10 bg-white/[0.03] text-[#A8B0BE] hover:bg-white/[0.06]'}`}>{item.title}</button>)}
    </nav>

    <article aria-live="polite" className="space-y-4">
      <div><h2 className="display text-xl font-semibold">{topic.title}</h2><p className="mt-2 text-sm leading-relaxed text-[#C8CDD6]">{topic.summary}</p></div>
      <ul className="space-y-3">{topic.points.map(point => <li key={point.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><h3 className="font-semibold text-[#F1F3F2]">{point.title}</h3><p className="mt-1.5 text-sm leading-relaxed text-[#A8B0BE]">{point.body}</p></li>)}</ul>
    </article>
  </div>
}
