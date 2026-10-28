import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { erc20Abi, formatUnits, isAddress, parseEventLogs, type Abi, type Address, type Hash } from 'viem'
import { ARC_MAINNET_ID, ARC_TESTNET_ID, JANUS_PURCHASE_ABI, JANUS_PURCHASE_ADDRESS, JANUS_PURCHASE_TESTNET_ADDRESS } from '../contracts'
import { buildTxExplorerUrl, getUsdc } from '../onchain-facts'
import { parseUsdcInput } from '../lib/payments'
import { resolveRecipientInput } from '../lib/recipients'
import { useJanusAuth } from '../auth/AccountProvider'
import { janusApi } from '../lib/api'
import { useWalletIdentity } from '../hooks/useWalletIdentity'
import { mergeGroupParticipants, participantInputs, participantsForGroup, visibleJanusGroups, type JanusGroupsData } from '../lib/groups'
import {
  clearPendingPurchase, parsePurchaseDraft, parsePurchaseId, purchaseActionAvailability,
  readPendingPurchase, savePendingPurchase, type PendingPurchaseTx, type PurchaseInviteMetadata, type PurchaseSnapshot,
} from '../lib/purchases'
import Dialog from './Dialog'
import DeadlineField, { formatLocalDeadline, roundedDeadline } from './DeadlineField'

const purchaseAbi = JANUS_PURCHASE_ABI as Abi
const createdAbi = [{
  type: 'event', name: 'PurchaseCreated',
  inputs: [
    { name: 'purchaseId', type: 'bytes32', indexed: true },
    { name: 'organizer', type: 'address', indexed: true },
    { name: 'recipient', type: 'address', indexed: true },
    { name: 'targetAmount', type: 'uint256', indexed: false },
    { name: 'fundingDeadline', type: 'uint40', indexed: false },
    { name: 'releaseDeadline', type: 'uint40', indexed: false },
  ],
}] as const
const statusNames = ['Funding', 'Funded', 'Released', 'Cancelled', 'Expired']
type Action = { fn: string; args: readonly unknown[]; kind: string; label: string; detail: string; id?: Hash; metadata?: PurchaseInviteMetadata }

function snapshot(value: unknown): PurchaseSnapshot {
  if (!Array.isArray(value) || value.length !== 8) throw new Error('Unexpected purchase data from Arc.')
  const row = value as unknown[]
  const [organizer, recipient, usdcToken, target, funded, fundingDeadline, releaseDeadline, status] = row
  if (typeof organizer !== 'string' || typeof recipient !== 'string' || typeof usdcToken !== 'string' ||
    !isAddress(organizer) || !isAddress(recipient) || !isAddress(usdcToken) ||
    typeof target !== 'bigint' || typeof funded !== 'bigint' ||
    (typeof fundingDeadline !== 'number' && typeof fundingDeadline !== 'bigint') ||
    (typeof releaseDeadline !== 'number' && typeof releaseDeadline !== 'bigint') ||
    (typeof status !== 'number' && typeof status !== 'bigint') ||
    !Number.isSafeInteger(Number(fundingDeadline)) || !Number.isSafeInteger(Number(releaseDeadline)) ||
    !Number.isInteger(Number(status))) {
    throw new Error('Invalid purchase data from Arc.')
  }
  return { organizer, recipient, usdcToken, target, funded,
    fundingDeadline: Number(fundingDeadline), releaseDeadline: Number(releaseDeadline), status: Number(status) }
}

export default function SharedPurchase({ onClose, onOpenDocs, network = 'mainnet', initialPurchaseId }: { onClose: () => void; onOpenDocs?: () => void; network?: 'mainnet' | 'testnet'; initialPurchaseId?: Hash }) {
  const { address, chainId: connectedChainId } = useAccount()
  const auth = useJanusAuth()
  const queries = useQueryClient()
  const targetChainId = network === 'testnet' ? ARC_TESTNET_ID : ARC_MAINNET_ID
  const networkName = network === 'testnet' ? 'Arc Testnet' : 'Arc Mainnet'
  const client = usePublicClient({ chainId: targetChainId })
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const configuredContract = network === 'testnet' ? JANUS_PURCHASE_TESTNET_ADDRESS : JANUS_PURCHASE_ADDRESS
  const contract = configuredContract && isAddress(configuredContract) ? configuredContract : undefined
  const tokenFact = getUsdc(targetChainId)
  const token = tokenFact && isAddress(tokenFact.address) ? tokenFact.address : undefined
  const [mode, setMode] = useState<'create' | 'open'>(() => initialPurchaseId || readPendingPurchase(address, targetChainId) ? 'open' : 'create')
  const [idText, setIdText] = useState(initialPurchaseId ?? '')
  const [id, setId] = useState<Hash | undefined>(() => initialPurchaseId ?? readPendingPurchase(address, targetChainId)?.purchaseId)
  const [pending, setPending] = useState<PendingPurchaseTx | undefined>(() => readPendingPurchase(address, targetChainId))
  const [purchase, setPurchase] = useState<PurchaseSnapshot>()
  const purchaseRecipientIdentity = useWalletIdentity(purchase?.recipient)
  const [contribution, setContribution] = useState(0n)
  const [claimed, setClaimed] = useState(false)
  const [allowance, setAllowance] = useState(0n)
  const [balance, setBalance] = useState(0n)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [hash, setHash] = useState<Hash>()
  const [review, setReview] = useState<Action>()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [participants, setParticipants] = useState('')
  const [recipient, setRecipient] = useState('')
  const [target, setTarget] = useState('')
  const [funding, setFunding] = useState('')
  const [release, setRelease] = useState('')

  function updateFunding(value: string) {
    setFunding(value); setReview(undefined)
    if (!release && value) {
      const selected = new Date(value)
      if (Number.isFinite(selected.getTime())) {
        selected.setDate(selected.getDate() + 1)
        setRelease(formatLocalDeadline(selected))
      }
    }
  }

  function updateRelease(value: string) {
    setRelease(value); setReview(undefined)
  }
  const [amount, setAmount] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [groupEntries, setGroupEntries] = useState<string[]>([])
  const [groupNotice, setGroupNotice] = useState('')
  const groups = useQuery({
    queryKey: ['janus-groups', auth.subject],
    enabled: mode === 'create' && auth.authenticated && !!auth.subject,
    queryFn: ({ signal }) => janusApi<JanusGroupsData>(auth, 'groups', { signal }),
    staleTime: 10_000,
    retry: false,
  })
  const availableGroups = visibleJanusGroups(groups.data)

  const refresh = useCallback(async (purchaseId: Hash) => {
    if (!client || !contract || !address || !token) return
    setLoading(true); setError('')
    try {
      const [raw, paid, refunded, approved, available] = await Promise.all([
        client.readContract({ address: contract, abi: purchaseAbi, functionName: 'getPurchase', args: [purchaseId] }),
        client.readContract({ address: contract, abi: purchaseAbi, functionName: 'contributionOf', args: [purchaseId, address] }),
        client.readContract({ address: contract, abi: purchaseAbi, functionName: 'isRefundClaimed', args: [purchaseId, address] }),
        client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [address, contract] }),
        client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
      ])
      const next = snapshot(raw)
      if (next.usdcToken.toLowerCase() !== token.toLowerCase()) throw new Error('Purchase uses an unexpected token.')
      setPurchase(next); setContribution(BigInt(paid as bigint)); setClaimed(Boolean(refunded))
      setAllowance(BigInt(approved)); setBalance(available)
    } catch (cause) {
      setPurchase(undefined)
      setError(cause instanceof Error ? cause.message : 'Could not load the purchase.')
    } finally { setLoading(false) }
  }, [client, contract, address, token])
  useEffect(() => {
    if (!initialPurchaseId) return
    const timer = window.setTimeout(() => { void refresh(initialPurchaseId) }, 0)
    return () => window.clearTimeout(timer)
  }, [initialPurchaseId, refresh])


  async function confirm(submittedHash: Hash, kind: string, purchaseId?: Hash, metadata?: PurchaseInviteMetadata) {
    if (!client || !address) return
    setBusy(true); setError('')
    let chainConfirmed = false
    try {
      const receipt = await client.waitForTransactionReceipt({ hash: submittedHash, timeout: 60_000 })
      if (receipt.status !== 'success') {
        clearPendingPurchase(address, targetChainId); setPending(undefined)
        setError('The transaction reverted. No successful action was recorded.')
        return
      }
      let resolvedId = purchaseId
      if (kind === 'create') {
        const events = parseEventLogs({ abi: createdAbi, eventName: 'PurchaseCreated', logs: receipt.logs })
        const created = events.find(event => event.address.toLowerCase() === contract?.toLowerCase())
        const createdId = created?.args.purchaseId
        if (typeof createdId !== 'string') {
          clearPendingPurchase(address, targetChainId); setPending(undefined); setHash(submittedHash)
          setError('Creation was confirmed, but the purchase ID could not be read. Check the explorer before creating again.')
          return
        }
        resolvedId = parsePurchaseId(createdId)
        chainConfirmed = true
        const retryable = { hash: submittedHash, kind, purchaseId: resolvedId, metadata }
        setPending(retryable); savePendingPurchase(address, retryable, targetChainId)
        if (!metadata) throw new Error('Purchase invitation details are missing. Check the confirmed purchase before retrying.')
        await janusApi(auth, 'purchases', {
          method: 'POST',
          body: {
            chainId: targetChainId, contract, onchainId: resolvedId, txHash: submittedHash,
            organizer: address, recipient: metadata.recipient, targetRaw: metadata.targetRaw,
            fundingDeadline: metadata.fundingDeadline, releaseDeadline: metadata.releaseDeadline,
            title: metadata.title, description: metadata.description, participants: metadata.participants,
            groupId: metadata.groupId,
          },
        })
        await queries.invalidateQueries({ queryKey: ['janus-purchase-activity', auth.subject] })
      }
      clearPendingPurchase(address, targetChainId); setPending(undefined); setHash(submittedHash); setReview(undefined)
      setNotice(kind === 'approve' ? 'Exact allowance confirmed. Review the contribution next.' : 'Action confirmed on ' + networkName + '.')
      if (kind === 'create') setMode('open')
      if (kind === 'cancel' || kind === 'markExpired' || kind === 'claimRefund') {
        await queries.invalidateQueries({ queryKey: ['janus-inbox', auth.subject] })
      }
      if (resolvedId) { setIdText(resolvedId); setId(resolvedId); await refresh(resolvedId) }
    } catch {
      setError(chainConfirmed && kind === 'create'
        ? 'Purchase confirmed on Arc, but invitations were not saved. Apply the purchase-invitations database migration, then use Check confirmation to retry.'
        : 'Confirmation is unavailable. Check this transaction before trying another action.')
    } finally { setBusy(false) }
  }

  async function submit(action: Action) {
    if (!address || !client || !contract || !token || busy || pending) return
    setBusy(true); setError(''); setNotice('')
    let submitted = false
    try {
      if (connectedChainId !== targetChainId) await switchChainAsync({ chainId: targetChainId })
      const tokenAction = action.fn === 'approve'
      const destination: Address = tokenAction ? token : contract
      const abi: Abi = tokenAction ? erc20Abi : purchaseAbi
      await client.simulateContract({ address: destination, abi, functionName: action.fn, args: action.args, account: address })
      const txHash = await writeContractAsync({ address: destination, abi, functionName: action.fn, args: action.args,
        chainId: targetChainId, account: address })
      submitted = true
      const next = { hash: txHash, kind: action.kind, purchaseId: action.id, metadata: action.metadata }
      setHash(txHash); setPending(next); setReview(undefined); savePendingPurchase(address, next, targetChainId)
      await confirm(txHash, action.kind, action.id, action.metadata)
    } catch (cause) {
      if (!submitted) {
        const message = cause instanceof Error ? cause.message.toLowerCase() : ''
        setError(message.includes('reject') || message.includes('denied')
          ? 'You cancelled the wallet request. No successful action was recorded.'
          : 'Unable to submit. Check your wallet, balance, network and current purchase state.')
      }
    } finally { setBusy(false) }
  }

  function openPurchase() {
    setError(''); setNotice(''); setPurchase(undefined); setReview(undefined)
    try { const parsed = parsePurchaseId(idText); setId(parsed); void refresh(parsed) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid purchase ID.') }
  }

  function selectGroup(nextId: string) {
    setError('')
    setGroupNotice('')
    setReview(undefined)
    const withoutPrevious = mergeGroupParticipants(participants, groupEntries, [])
    if (!nextId) {
      setSelectedGroupId('')
      setGroupEntries([])
      setParticipants(withoutPrevious)
      return
    }
    if (!groups.data) {
      setError('Groups are still loading. Try again.')
      return
    }
    try {
      const selected = participantsForGroup(groups.data, nextId, 20)
      const merged = mergeGroupParticipants(participants, groupEntries, selected.entries)
      if (participantInputs(merged).length > 20) throw new Error('A purchase supports at most 20 participants including manual additions.')
      setSelectedGroupId(nextId)
      setGroupEntries(selected.entries)
      setParticipants(merged)
      setGroupNotice('Added ' + selected.entries.length + ' accepted member' + (selected.entries.length === 1 ? '' : 's') + ' from ' + selected.group.name + (selected.excluded ? '. Pending or declined members were excluded.' : '.'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to use this group.')
    }
  }

  async function reviewCreate() {
    if (!contract) return
    setError(''); setNotice('')
    try {
      const cleanTitle = title.trim()
      if (!cleanTitle || cleanTitle.length > 120) throw new Error('Enter a purchase title up to 120 characters.')
      const cleanDescription = description.trim()
      if (cleanDescription.length > 500) throw new Error('Description must be 500 characters or fewer.')
      const participantInputs = participants.split(/[\n,]+/).map(item => item.trim()).filter(Boolean)
      if (participantInputs.length < 1 || participantInputs.length > 20) throw new Error('Add 1 to 20 participant usernames.')
      const resolved = await resolveRecipientInput(recipient)
      const resolvedParticipants = await Promise.all(participantInputs.map(item => resolveRecipientInput(item)))
      const participantAddresses = resolvedParticipants.map(item => item.address.toLowerCase())
      if (new Set(participantAddresses).size !== participantAddresses.length) throw new Error('Each participant may be invited only once.')
      if (address && participantAddresses.includes(address.toLowerCase())) throw new Error('Remove your own username or wallet from Participants.')
      const draft = parsePurchaseDraft(resolved.address, target, funding, release, contract)
      const metadata: PurchaseInviteMetadata = {
        title: cleanTitle, description: cleanDescription, participants: participantInputs,
        groupId: selectedGroupId || undefined,
        recipient: draft.recipient, targetRaw: draft.amount.toString(),
        fundingDeadline: draft.fundingDeadline, releaseDeadline: draft.releaseDeadline,
      }
      const detail = formatUnits(draft.amount, 6) + ' USDC target. Recipient: ' + (resolved.username ? resolved.username + ' (' + draft.recipient + ')' : draft.recipient) +
        '. Funding closes ' + new Date(draft.fundingDeadline * 1000).toLocaleString() +
        '. Organizer may release after full funding and before ' + new Date(draft.releaseDeadline * 1000).toLocaleString() +
        '. Cancellation or expiry makes each contribution individually refundable.'
      setReview({ fn: 'createPurchase', args: [draft.recipient, draft.amount, draft.fundingDeadline, draft.releaseDeadline],
        kind: 'create', label: 'Create purchase', detail: detail + ' Invitations: ' +
          resolvedParticipants.map((item, index) => item.username ?? participantInputs[index]).join(', ') + '.', metadata })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the purchase details.') }
  }

  function reviewContribution() {
    if (!purchase || !id || !contract) return
    setError(''); setNotice('')
    try {
      const units = parseUsdcInput(amount)
      if (units > purchase.target - purchase.funded) throw new Error('Amount exceeds the remaining target.')
      if (units > balance) throw new Error('Insufficient USDC balance. Keep USDC for gas.')
      if (allowance < units) setReview({ fn: 'approve', args: [contract, units], kind: 'approve', id,
        label: 'Approve exact amount', detail: 'Allow the purchase contract ' + contract + ' to spend up to ' +
          formatUnits(units, 6) + ' USDC. This does not contribute funds.' })
      else setReview({ fn: 'contribute', args: [id, units], kind: 'contribute', id,
        label: 'Contribute', detail: 'Move ' + formatUnits(units, 6) + ' USDC into escrow. After full funding, the organizer may release to ' +
          purchase.recipient + ' before the deadline. Released funds cannot be refunded by JANUS.' })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the contribution amount.') }
  }

  function transition(fn: string, label: string, detail: string) {
    if (!id) return
    setReview({ fn, args: [id], kind: fn, id, label, detail }); setError(''); setNotice('')
  }

  const available = purchase && address ? purchaseActionAvailability(purchase, address, contribution, claimed) : undefined
  const locked = busy || !!pending
  return <Dialog label="Shared purchases" onClose={onClose} busy={busy}>
    <h2 className="display text-xl font-semibold mb-2">Shared purchases</h2>
    {onOpenDocs && <button type="button" onClick={onOpenDocs} className="min-h-10 text-sm font-medium text-[#9BAEFF] underline">Split or Purchase? Read Docs</button>}
    {!contract ? <p className="text-sm text-[#A8B0BE]">Purchases open after the reviewed JanusPurchase deployment is configured. No funds can be collected here yet.</p> : <div className="space-y-5 text-sm">
      <p className="text-[#A8B0BE]">Escrow uses {networkName} USDC. The organizer controls release after full funding, before the release deadline. Contributors claim their own refunds after cancellation or expiry.</p>
      <div role="tablist" aria-label="Shared purchase workflow" className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
        <button type="button" role="tab" aria-selected={mode === 'create'} className={`rounded-lg px-3 py-3 font-semibold transition ${mode === 'create' ? 'bg-[#4D6BFF] text-white' : 'text-[#A8B0BE] hover:bg-white/5'}`} onClick={() => { setMode('create'); setReview(undefined); setError(''); setNotice('') }}>Create purchase</button>
        <button type="button" role="tab" aria-selected={mode === 'open'} className={`rounded-lg px-3 py-3 font-semibold transition ${mode === 'open' ? 'bg-[#4D6BFF] text-white' : 'text-[#A8B0BE] hover:bg-white/5'}`} onClick={() => { setMode('open'); setReview(undefined); setError(''); setNotice('') }}>Open purchase</button>
      </div>
      {pending && <div className="rounded-xl border border-amber-400/40 p-3 space-y-2">
        <p role="status" className="text-amber-300">A {pending.kind} transaction needs confirmation. Check it before another action.</p>
        <a href={buildTxExplorerUrl(targetChainId, pending.hash)} target="_blank" rel="noopener noreferrer" className="text-[#9BAEFF] underline break-all">View pending transaction</a>
        <button className="janus-secondary w-full" disabled={busy} onClick={() => { void confirm(pending.hash, pending.kind, pending.purchaseId, pending.metadata) }}>Check confirmation</button>
      </div>}
      {mode === 'open' && <>
      <section className="space-y-3 border-t border-white/10 pt-4">
        <h3 className="font-semibold">Open a purchase</h3>
        <label className="field-label">Purchase ID<input className="janus-input mono" value={idText} onChange={event => setIdText(event.target.value)} placeholder="0x + 64-character purchase ID" autoComplete="off" spellCheck={false} /></label>
        <button className="janus-secondary w-full" disabled={locked} onClick={openPurchase}>Load from Arc</button>
      </section>
      {loading && <p role="status">Loading purchase…</p>}
      {purchase && id && <section className="space-y-3 rounded-xl border border-white/10 p-4">
        <h3 className="font-semibold">Purchase on Arc</h3>
        <p className="mono text-xs break-all">{id}</p>
        <dl className="space-y-2">
          <div className="flex justify-between gap-3"><dt>Status</dt><dd>{statusNames[purchase.status] ?? 'Unknown'}</dd></div>
          <div className="flex justify-between gap-3"><dt>Funded</dt><dd>{formatUnits(purchase.funded, 6)} / {formatUnits(purchase.target, 6)} USDC</dd></div>
          <div><dt>Organizer</dt><dd className="mono text-xs break-all">{purchase.organizer}</dd></div>
          <div><dt>Recipient</dt><dd>{purchaseRecipientIdentity.data?.username ? <span className="font-medium">@{purchaseRecipientIdentity.data.username}</span> : <span className="mono text-xs break-all">{purchase.recipient}</span>}{purchaseRecipientIdentity.data?.username && <span className="mono block text-xs break-all text-[#A8B0BE] mt-1">{purchase.recipient}</span>}</dd></div>
          <div><dt>Funding closes</dt><dd>{new Date(purchase.fundingDeadline * 1000).toLocaleString()}</dd></div>
          <div><dt>Release deadline</dt><dd>{new Date(purchase.releaseDeadline * 1000).toLocaleString()}</dd></div>
          <div><dt>Your contribution</dt><dd>{formatUnits(contribution, 6)} USDC{claimed ? ' — refund claimed' : ''}</dd></div>
        </dl>
        {available?.contribute && <div className="space-y-2 pt-2">
          <label className="field-label">Contribution (USDC)<input className="janus-input" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /></label>
          <p className="text-xs text-[#A8B0BE]">Allowance: {formatUnits(allowance, 6)} USDC. Approval and contribution are separate transactions.</p>
          <button className="janus-primary w-full" disabled={locked} onClick={reviewContribution}>Review contribution</button>
        </div>}
        {available?.release && <button className="janus-primary w-full" disabled={locked} onClick={() => transition('release', 'Release funds', 'Send ' + formatUnits(purchase.funded, 6) + ' USDC to ' + purchase.recipient + '. This ends escrow and cannot be refunded by JANUS.')}>Review release</button>}
        {available?.cancel && <button className="janus-secondary w-full" disabled={locked} onClick={() => transition('cancel', 'Cancel purchase', 'Each contributor must claim their own refund. Cancellation cannot be undone.')}>Review cancellation</button>}
        {available?.expire && <button className="janus-secondary w-full" disabled={locked} onClick={() => transition('markExpired', 'Mark expired', 'Each contributor must claim their own refund.')}>Review expiry</button>}
        {available?.refund && <button className="janus-primary w-full" disabled={locked} onClick={() => transition('claimRefund', 'Claim refund', 'Claim your ' + formatUnits(contribution, 6) + ' USDC contribution back to this wallet.')}>Review refund</button>}
        <button className="janus-secondary w-full" disabled={locked} onClick={() => { void refresh(id) }}>Refresh on-chain state</button>
      </section>}
      </>}
      {mode === 'create' &&
      <section className="space-y-3 border-t border-white/10 pt-4">
        <h3 className="font-semibold">Create a purchase</h3>
        <p className="text-[#A8B0BE]">On-chain terms are fixed at creation. Invited JANUS users receive this purchase in Inbox after the transaction confirms.</p>
        <label className="field-label">Purchase title<input className="janus-input" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder="Dinner, group order, event..." /></label>
        <label className="field-label">Description (optional)<textarea className="janus-input min-h-20 resize-y" value={description} onChange={event => setDescription(event.target.value)} maxLength={500} placeholder="What is this purchase for?" /></label>
        {availableGroups.length > 0 && <label className="field-label">Use a group, optional
          <select className="janus-input" value={selectedGroupId} onChange={event => selectGroup(event.target.value)}>
            <option value="">Choose participants manually</option>
            {availableGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <span className="text-xs text-[#77808F]">Selecting a group adds its accepted members. You can still edit the participant list.</span>
        </label>}
        {groups.isError && <p className="text-xs text-amber-300">Groups are unavailable. Manual participants still work.</p>}
        {groupNotice && <p role="status" className="text-xs text-emerald-300">{groupNotice}</p>}
        <label className="field-label">Participants<textarea className="janus-input min-h-24 resize-y mono" value={participants} onChange={event => setParticipants(event.target.value)} placeholder="@username, @another_user" autoComplete="off" spellCheck={false} /><span className="text-xs text-[#77808F]">Add 1-20 verified JANUS usernames, separated by commas or new lines.</span></label>
        <label className="field-label">Seller or pay recipient<input className="janus-input mono" value={recipient} onChange={event => { setRecipient(event.target.value); setReview(undefined) }} placeholder="@seller or 0x…" autoComplete="off" spellCheck={false} /><span className="block mt-2 text-xs text-[#A8B0BE]">This wallet receives the USDC after full funding and release. The recipient cannot be changed after creation.</span></label>
        <label className="field-label">Target (USDC)<input className="janus-input" inputMode="decimal" value={target} onChange={event => setTarget(event.target.value)} placeholder="0.00" /></label>
        <DeadlineField label="Funding deadline" value={funding} onChange={updateFunding}

          shortcuts={[
            { label: 'In 1 hour', getValue: () => formatLocalDeadline(roundedDeadline(new Date(Date.now() + 60 * 60_000))) },
            { label: 'Tomorrow at 6 PM', getValue: () => {
              const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(18, 0, 0, 0)
              return formatLocalDeadline(tomorrow)
            } },
          ]} />
        <DeadlineField label="Release deadline" value={release} onChange={updateRelease}
          minDate={funding ? funding.slice(0, 10) : undefined}
          shortcuts={funding ? [
            { label: '1 hour after funding', getValue: () => formatLocalDeadline(roundedDeadline(new Date(new Date(funding).getTime() + 60 * 60_000))) },
            { label: '1 day after funding', getValue: () => {
              const next = new Date(funding); next.setDate(next.getDate() + 1)
              return formatLocalDeadline(next)
            } },
          ] : []}
          hint={funding ? 'Times use your device’s local time zone.' : 'Set the funding deadline first to see release shortcuts.'} />
        <button className="janus-primary w-full" disabled={locked} onClick={() => { void reviewCreate() }}>Review purchase</button>
      </section>}
      {review && <section className="rounded-xl border border-[#4D6BFF]/50 p-4 space-y-3">
        <h3 className="font-semibold">{review.label}</h3><p className="text-[#C8CDD6]">{review.detail}</p>
        <p className="text-xs text-[#A8B0BE]">Your wallet shows the USDC network fee before signing.</p>
        <div className="flex gap-2"><button className="janus-secondary flex-1" onClick={() => setReview(undefined)}>Edit</button>
          <button className="janus-primary flex-1" disabled={locked} onClick={() => { void submit(review) }}>Confirm in wallet</button></div>
      </section>}
      {error && <p role="alert" className="text-amber-300 break-words">{error}</p>}
      {notice && <p role="status" className="text-green-300">{notice}</p>}
      {hash && <a href={buildTxExplorerUrl(targetChainId, hash)} target="_blank" rel="noopener noreferrer" className="text-[#9BAEFF] underline break-all">View transaction</a>}
      {busy && <p role="status">Waiting for wallet or Arc confirmation…</p>}
    </div>}
    <button className="janus-secondary w-full mt-5" disabled={busy} onClick={onClose}>Close</button>
  </Dialog>
}
