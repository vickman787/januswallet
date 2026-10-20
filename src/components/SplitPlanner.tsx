import { useState } from 'react'
import { formatUnits } from 'viem'
import { useAccount } from 'wagmi'
import { useJanusAuth } from '../auth/AccountProvider'
import { janusApi } from '../lib/api'
import { parseUsdcInput, splitUsdc } from '../lib/payments'
import { resolveRecipientInput, type ResolvedRecipient } from '../lib/recipients'
import Dialog from './Dialog'

type SplitResult = { share: bigint; recipient?: ResolvedRecipient; input?: string }
type CreatedSplit = { split: { id: string; title: string }; shares: { share_index: number }[] }

export default function SplitPlanner({ onClose }: { onClose: () => void }) {
  const auth = useJanusAuth()
  const { address } = useAccount()
  const [kind, setKind] = useState<'named' | 'open'>('named')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [recipient, setRecipient] = useState(address ?? '')
  const [amount, setAmount] = useState('')
  const [count, setCount] = useState('2')
  const [participants, setParticipants] = useState('')
  const [includeOrganizer, setIncludeOrganizer] = useState(true)
  const [organizerPaysRecipient, setOrganizerPaysRecipient] = useState(false)
  const [results, setResults] = useState<SplitResult[]>()
  const [organizerShare, setOrganizerShare] = useState<bigint>()
  const [created, setCreated] = useState<CreatedSplit>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function inputs() {
    return participants.split(/\r?\n|,/).map(value => value.trim()).filter(Boolean)
  }
  function resetReview() {
    setResults(undefined)
    setOrganizerShare(undefined)
    setOrganizerPaysRecipient(false)
    setCreated(undefined)
  }
  async function calculate() {
    setError(''); resetReview(); setBusy(true)
    try {
      const total = parseUsdcInput(amount)
      const resolvedRecipient = await resolveRecipientInput(recipient)
      if (kind === 'open') {
        setResults(splitUsdc(total, Number(count)).map(share => ({ share })))
        return
      }
      const entries = inputs()
      if (!entries.length || entries.length > 100) throw new Error('Add 1 to 100 participant usernames or wallet addresses.')
      const resolved = await Promise.all(entries.map(input => resolveRecipientInput(input)))
      const unique = new Set(resolved.map(item => item.address.toLowerCase()))
      if (unique.size !== resolved.length) throw new Error('Each participant must resolve to a different wallet.')
      const organizerWallets = new Set([...(address ? [address] : []), ...auth.wallets.map(wallet => wallet.address)].map(wallet => wallet.toLowerCase()))
      if (resolved.some(item => organizerWallets.has(item.address.toLowerCase()))) throw new Error('Use Include me for the organizer. Remove your own username or wallet from Participants.')
      const recipientIsOrganizer = organizerWallets.has(resolvedRecipient.address.toLowerCase())
      const shares = splitUsdc(total, resolved.length + (includeOrganizer ? 1 : 0))
      if (includeOrganizer) {
        setOrganizerShare(shares[0])
        setOrganizerPaysRecipient(!recipientIsOrganizer)
      }
      const participantShares = includeOrganizer ? shares.slice(1) : shares
      setResults(participantShares.map((share, index) => ({ share, recipient: resolved[index], input: entries[index] })))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Check these split details.')
    } finally { setBusy(false) }
  }
  async function createSplit() {
    if (!results) return
    setError(''); setBusy(true)
    try {
      const stored = await janusApi<CreatedSplit>(auth, 'splits', {
        method: 'POST',
        body: {
          kind,
          title,
          description,
          recipient,
          totalRaw: parseUsdcInput(amount).toString(),
          participants: kind === 'named' ? inputs() : undefined,
          includeOrganizer: kind === 'named' ? includeOrganizer : undefined,
          shareCount: kind === 'open' ? Number(count) : undefined,
        },
      })
      setCreated(stored)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create this split.')
    } finally { setBusy(false) }
  }
  async function copyLink() {
    if (!created) return
    const link = new URL(window.location.href)
    link.search = ''
    link.hash = 'split=' + created.split.id
    try { await navigator.clipboard.writeText(link.toString()) }
    catch { setError('Copy unavailable. Select the split ID below and share it manually.') }
  }

  return <Dialog label="Create a split" onClose={onClose} busy={busy}>
    <h2 className="display text-xl font-semibold mb-3">Create a split</h2>
    <p className="text-sm text-[#A8B0BE] mb-5">A verified JANUS username has the same payment function as its verified wallet address.</p>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void calculate() }}>
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="field-label mb-2">Split type</legend>
        <button type="button" className={kind === 'named' ? 'janus-primary' : 'janus-secondary'} onClick={() => { setKind('named'); resetReview() }}>Named</button>
        <button type="button" className={kind === 'open' ? 'janus-primary' : 'janus-secondary'} onClick={() => { setKind('open'); resetReview() }}>Open</button>
      </fieldset>
      <label className="field-label">Title<input className="janus-input" maxLength={120} value={title} onChange={event => { setTitle(event.target.value); resetReview() }} placeholder="Dinner" required /></label>
      <label className="field-label">Description, optional<input className="janus-input" maxLength={500} value={description} onChange={event => { setDescription(event.target.value); resetReview() }} placeholder="Friday dinner split" /></label>
      <label className="field-label">Pay recipient<input className="janus-input mono" value={recipient} onChange={event => { setRecipient(event.target.value); resetReview() }} placeholder="@username or 0x…" required />
        <span className="block mt-2 text-xs text-[#A8B0BE]">Each payable share goes to this verified JANUS wallet.</span>
      </label>
      <label className="field-label">Total USDC<input className="janus-input" inputMode="decimal" value={amount} onChange={event => { setAmount(event.target.value); resetReview() }} placeholder="0.00" required /></label>
      {kind === 'named' ? <>
        <label className="flex items-start gap-3 rounded-xl border border-white/10 p-3 cursor-pointer">
          <input className="mt-1 h-4 w-4 accent-[#4D6BFF]" type="checkbox" checked={includeOrganizer} onChange={event => { setIncludeOrganizer(event.target.checked); resetReview() }} />
          <span><span className="block text-sm font-medium text-[#F1F3F2]">Include me in this split</span><span className="block mt-1 text-xs text-[#A8B0BE]">On by default. Your portion counts toward the total, but you are not added to the Participants list.</span></span>
        </label>
        <label className="field-label">Participants
          <textarea className="janus-input min-h-28" value={participants} onChange={event => { setParticipants(event.target.value); resetReview() }}
            placeholder={'@alice\n0x1234…\n@bob'} required />
          <span className="block mt-2 text-xs text-[#A8B0BE]">Enter every other participant once, using a verified username or wallet address.</span>
        </label>
      </> : <label className="field-label">Number of open shares<input className="janus-input" type="number" min="1" max="1000" step="1" value={count} onChange={event => { setCount(event.target.value); resetReview() }} required /></label>}
      {error && <p role="alert" className="text-red-300 text-sm">{error}</p>}
      {!created && <button className="janus-primary w-full" disabled={busy} type="submit">{busy ? 'Resolving participants…' : results ? 'Recalculate shares' : 'Review shares'}</button>}
    </form>
    {results && !created && <div className="mt-5 space-y-3 text-sm" role="status">
      <p>{organizerShare !== undefined ? `1 organizer share and ${results.length} participant ${results.length === 1 ? 'share' : 'shares'}` : `${results.length} participant ${results.length === 1 ? 'share' : 'shares'}`} total exactly {formatUnits(results.reduce((sum, row) => sum + row.share, organizerShare ?? 0n), 6)} USDC.</p>
      <p className="text-[#A8B0BE]">Review every resolved wallet before creating the split.</p>
      <ol className="max-h-64 overflow-auto space-y-3">
        {organizerShare !== undefined && <li className="rounded-xl border border-[#4D6BFF]/30 bg-[#4D6BFF]/5 p-3">
          <div className="flex justify-between gap-3"><span>Organizer · included</span><span className="tabnum">{formatUnits(organizerShare, 6)} USDC</span></div>
          <p className="text-xs text-[#A8B0BE] mt-2">{organizerPaysRecipient ? 'You will receive a payable share because another account receives the split.' : 'You receive the split, so this portion is already yours and creates no self-payment.'}</p>
        </li>}
        {results.map((row, index) => <li key={index} className="rounded-xl border border-white/10 p-3">
          <div className="flex justify-between gap-3"><span>Share {index + 1}{row.recipient?.username ? ' · ' + row.recipient.username : ''}</span><span className="tabnum">{formatUnits(row.share, 6)} USDC</span></div>
          {row.recipient && <p className="mono text-xs break-all text-[#A8B0BE] mt-2">{row.recipient.address}</p>}
        </li>)}
      </ol>
      <p className="text-[#A8B0BE]">One-unit remainders go to the organizer first when included, then to participant shares, so the total remains exact.</p>
      <button className="janus-primary w-full" disabled={busy} onClick={() => { void createSplit() }}>{busy ? 'Creating split…' : 'Create split'}</button>
    </div>}
    {created && <div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4 text-sm" role="status">
      <p className="font-semibold text-emerald-200">Split created with {created.shares.length} payable {created.shares.length === 1 ? 'share' : 'shares'}.</p>
      {organizerShare !== undefined && <p className="text-[#A8B0BE] mt-2">Your organizer share is {formatUnits(organizerShare, 6)} USDC.</p>}
      <p className="mono mt-2 break-all text-xs text-[#A8B0BE]">{created.split.id}</p>
      <button className="janus-secondary w-full mt-4" onClick={() => { void copyLink() }}>Copy split link</button>
    </div>}
    <button className="janus-secondary w-full mt-5" disabled={busy} onClick={onClose}>Close</button>
  </Dialog>
}