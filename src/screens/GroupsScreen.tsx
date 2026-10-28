import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Plus, RefreshCw, Trash2, UserPlus, Users } from 'lucide-react'
import { useJanusAuth } from '../auth/AccountProvider'
import Dialog from '../components/Dialog'
import { janusApi } from '../lib/api'

type Group = { id: string; organizer_id: string; name: string; description: string; created_at: string }
type Membership = { group_id: string; profile_id: string; role: string; status: string }
type GroupMember = Membership & { username: string; display_name: string }
type GroupsData = { groups: Group[]; memberships: Membership[]; members: GroupMember[] }

function memberStatus(member: GroupMember) {
  if (member.role === 'organizer') return 'Organizer'
  if (member.status === 'accepted') return 'Member'
  if (member.status === 'invited') return 'Invited'
  return 'Declined'
}

export default function GroupsScreen() {
  const auth = useJanusAuth()
  const queries = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [members, setMembers] = useState('')
  const [newMembers, setNewMembers] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const groups = useQuery({
    queryKey: ['janus-groups', auth.subject],
    enabled: auth.authenticated && !!auth.subject,
    queryFn: ({ signal }) => janusApi<GroupsData>(auth, 'groups', { signal }),
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
  const membershipByGroup = new Map((groups.data?.memberships ?? []).map(item => [item.group_id, item]))
  const visibleGroups = (groups.data?.groups ?? []).filter(group => {
    const membership = membershipByGroup.get(group.id)
    return membership?.role === 'organizer' || membership?.status === 'accepted'
  })
  const selectedGroup = visibleGroups.find(group => group.id === selectedId) ?? null
  const selectedMembership = selectedGroup ? membershipByGroup.get(selectedGroup.id) : undefined
  const selectedMembers = (groups.data?.members ?? []).filter(member => member.group_id === selectedId)
    .sort((left, right) => left.role === 'organizer' ? -1 : right.role === 'organizer' ? 1 : left.username.localeCompare(right.username))
  const isOrganizer = selectedMembership?.role === 'organizer'
  const acceptedMembers = selectedMembers.filter(member => member.role === 'organizer' || member.status === 'accepted')
  const pendingMembers = isOrganizer ? selectedMembers.filter(member => member.status === 'invited') : []
  const declinedMembers = isOrganizer ? selectedMembers.filter(member => member.status === 'declined') : []

  async function refreshGroups() {
    await Promise.all([
      queries.invalidateQueries({ queryKey: ['janus-groups', auth.subject] }),
      queries.invalidateQueries({ queryKey: ['janus-inbox', auth.subject] }),
    ])
  }

  async function createGroup() {
    setBusy(true); setError('')
    try {
      const entries = members.split(/\r?\n|,/).map(value => value.trim()).filter(Boolean)
      const result = await janusApi<{ group: Group }>(auth, 'groups', { method: 'POST', body: { name, description, members: entries } })
      await refreshGroups()
      setName(''); setDescription(''); setMembers(''); setCreating(false); setSelectedId(result.group.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create this group.')
    } finally { setBusy(false) }
  }

  async function addMembers() {
    if (!selectedGroup) return
    setActionBusy(true); setActionError('')
    try {
      const entries = newMembers.split(/\r?\n|,/).map(value => value.trim()).filter(Boolean)
      await janusApi(auth, `groups/${selectedGroup.id}/members`, { method: 'POST', body: { members: entries } })
      setNewMembers('')
      await refreshGroups()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Unable to add these members.')
    } finally { setActionBusy(false) }
  }

  async function removeMember(member: GroupMember) {
    if (!selectedGroup || member.role === 'organizer') return
    setRemoving(member.profile_id); setActionError('')
    try {
      await janusApi(auth, `groups/${selectedGroup.id}/members/${member.profile_id}`, { method: 'DELETE' })
      await refreshGroups()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Unable to remove this member.')
    } finally { setRemoving(null) }
  }

  async function leaveGroup() {
    if (!selectedGroup || isOrganizer) return
    setLeaving(true); setActionError('')
    try {
      await janusApi(auth, `groups/${selectedGroup.id}/membership`, { method: 'DELETE' })
      setSelectedId(null)
      await refreshGroups()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Unable to leave this group.')
    } finally { setLeaving(false) }
  }
  return <div className="flex flex-col pb-4">
    <div className="flex items-center justify-between px-4 pt-4 pb-3">
      <h1 className="display font-semibold text-base text-[#F1F3F2]">Groups</h1>
      <div className="flex items-center gap-1">
        <button onClick={() => { void groups.refetch() }} disabled={groups.isFetching} aria-label="Refresh groups" className="p-2 rounded-lg disabled:opacity-50"><RefreshCw size={16} /></button>
        <button onClick={() => setCreating(true)} className="flex min-h-9 items-center gap-1.5 rounded-full border border-[#4D6BFF]/25 bg-[#4D6BFF]/10 px-3 py-1.5 text-xs font-medium text-[#9BAEFF]">
          <Plus size={14} />New group
        </button>
      </div>
    </div>

    {groups.isPending && <p className="mx-4 janus-panel p-5 text-sm text-[#A8B0BE]" role="status">Loading groups…</p>}
    {groups.error && <div className="mx-4 janus-panel p-5 text-sm text-amber-300" role="alert"><p>{groups.error.message}</p><button className="janus-secondary mt-4" onClick={() => { void groups.refetch() }}>Retry</button></div>}
    {!groups.isPending && !groups.error && visibleGroups.length === 0 && <div className="mx-4 rounded-2xl py-16 flex flex-col items-center gap-3 border border-white/[0.06] bg-white/[0.03]">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[#4D6BFF]/15 bg-[#4D6BFF]/[0.08]"><Users size={22} className="text-[#4D6BFF]" /></span>
      <p className="text-sm font-medium text-[#77808F]">No groups yet</p>
      <p className="max-w-xs text-center text-xs text-[#4E5561]">Create a group and invite verified JANUS accounts.</p>
      <button onClick={() => setCreating(true)} className="janus-primary mt-2">Create a group</button>
    </div>}
    {visibleGroups.length > 0 && <ul className="px-4 space-y-3">
      {visibleGroups.map(group => {
        const membership = membershipByGroup.get(group.id)
        const memberCount = (groups.data?.members ?? []).filter(member => member.group_id === group.id && (member.role === 'organizer' || member.status === 'accepted')).length
        return <li key={group.id}>
          <button type="button" onClick={() => { setActionError(''); setNewMembers(''); setSelectedId(group.id) }} className="janus-panel w-full p-4 text-left focus-visible:ring-2 focus-visible:ring-[#4D6BFF]">
            <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#4D6BFF]/25 bg-[#4D6BFF]/10"><Users size={18} className="text-[#9BAEFF]" /></span>
              <div className="min-w-0 flex-1"><h2 className="font-semibold break-words">{group.name}</h2><p className="mt-1 text-xs text-[#77808F]">{membership?.role === 'organizer' ? 'You organize this group' : 'Member'} · {memberCount} {memberCount === 1 ? 'member' : 'members'}</p>{group.description && <p className="mt-3 text-sm text-[#A8B0BE] break-words">{group.description}</p>}</div>
              <ChevronRight size={18} className="mt-2 shrink-0 text-[#77808F]" />
            </div>
          </button>
        </li>
      })}
    </ul>}

    {selectedGroup && <Dialog label={`${selectedGroup.name} group details`} busy={actionBusy || !!removing || leaving} onClose={() => setSelectedId(null)}>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#4D6BFF]/25 bg-[#4D6BFF]/10"><Users size={20} className="text-[#9BAEFF]" /></span>
        <div className="min-w-0"><h2 className="display text-xl font-semibold break-words">{selectedGroup.name}</h2>{selectedGroup.description && <p className="mt-2 text-sm text-[#A8B0BE] break-words">{selectedGroup.description}</p>}</div>
      </div>

      <section className="mt-6" aria-labelledby="group-members-heading">
        <div className="flex items-center justify-between gap-3"><h3 id="group-members-heading" className="font-semibold">Members</h3><span className="text-xs text-[#77808F]">{acceptedMembers.length} total</span></div>
        <ul className="mt-3 space-y-2">
          {acceptedMembers.map(member => <li key={member.profile_id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4D6BFF]/10 text-sm font-semibold text-[#9BAEFF]">{member.display_name.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.display_name}</p><p className="truncate text-xs text-[#77808F]">@{member.username} · {memberStatus(member)}</p></div>
            {isOrganizer && member.role !== 'organizer' && <button type="button" disabled={!!removing || actionBusy} onClick={() => { void removeMember(member) }} aria-label={`Remove @${member.username} from ${selectedGroup.name}`} className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-rose-300 hover:bg-rose-400/10 disabled:opacity-50"><Trash2 size={14} />{removing === member.profile_id ? 'Removing…' : 'Remove'}</button>}
          </li>)}
        </ul>
      </section>

      {isOrganizer && pendingMembers.length > 0 && <section className="mt-6 border-t border-white/[0.08] pt-5"><h3 className="font-semibold">Pending invitations · {pendingMembers.length}</h3><ul className="mt-3 space-y-2">{pendingMembers.map(member => <li key={member.profile_id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.display_name}</p><p className="truncate text-xs text-[#77808F]">@{member.username} · Invited, awaiting acceptance</p></div><button type="button" disabled={!!removing || actionBusy} onClick={() => { void removeMember(member) }} className="min-h-9 rounded-lg px-2 text-xs text-rose-300 hover:bg-rose-400/10">Cancel invite</button></li>)}</ul></section>}
      {isOrganizer && declinedMembers.length > 0 && <section className="mt-6 border-t border-white/[0.08] pt-5"><h3 className="font-semibold">Declined invitations · {declinedMembers.length}</h3><ul className="mt-3 space-y-2">{declinedMembers.map(member => <li key={member.profile_id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.display_name}</p><p className="truncate text-xs text-[#77808F]">@{member.username} · Declined</p></div><button type="button" disabled={!!removing || actionBusy} onClick={() => { void removeMember(member) }} className="min-h-9 rounded-lg px-2 text-xs text-rose-300 hover:bg-rose-400/10">Remove</button></li>)}</ul></section>}
      {isOrganizer && <form className="mt-6 border-t border-white/[0.08] pt-5" onSubmit={event => { event.preventDefault(); void addMembers() }}>
        <div className="mb-3 flex items-center gap-2"><UserPlus size={17} className="text-[#9BAEFF]" /><h3 className="font-semibold">Add members</h3></div>
        <label className="field-label">Usernames or wallet addresses<textarea className="janus-input min-h-24" required value={newMembers} onChange={event => setNewMembers(event.target.value)} placeholder={'@alice\n@bob\n0x1234…'} /><span className="block mt-2 text-xs text-[#A8B0BE]">New members receive an invitation in their JANUS inbox.</span></label>
        {actionError && <p role="alert" className="mt-3 text-sm text-amber-300">{actionError}</p>}
        <button className="janus-primary mt-4 w-full" disabled={actionBusy || !!removing}>{actionBusy ? 'Adding…' : 'Invite members'}</button>
      </form>}
      {!isOrganizer && <section className="mt-6 border-t border-white/[0.08] pt-5">
        <h3 className="font-semibold">Group membership</h3>
        <p className="mt-2 text-sm text-[#A8B0BE]">Leaving removes this group from your account. The organizer can invite you again later.</p>
        {actionError && <p role="alert" className="mt-3 text-sm text-amber-300">{actionError}</p>}
        <button type="button" className="mt-4 min-h-11 w-full rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 font-semibold text-rose-300 disabled:opacity-50" disabled={leaving} onClick={() => { void leaveGroup() }}>{leaving ? 'Leaving…' : 'Leave group'}</button>
      </section>}
      <button type="button" className="janus-secondary mt-4 w-full" disabled={actionBusy || !!removing || leaving} onClick={() => setSelectedId(null)}>Close</button>
    </Dialog>}

    {creating && <Dialog label="Create group" busy={busy} onClose={() => setCreating(false)}>
      <h2 className="display text-xl font-semibold">Create a group</h2>
      <p className="mt-2 text-sm text-[#A8B0BE]">Members receive an invitation in JANUS and choose whether to join.</p>
      <form className="mt-5 space-y-4" onSubmit={event => { event.preventDefault(); void createGroup() }}>
        <label className="field-label">Group name<input className="janus-input" maxLength={80} required value={name} onChange={event => setName(event.target.value)} placeholder="Weekend crew" /></label>
        <label className="field-label">Description, optional<textarea className="janus-input min-h-24" maxLength={500} value={description} onChange={event => setDescription(event.target.value)} placeholder="People included in our regular shared expenses" /></label>
        <label className="field-label">Members<textarea className="janus-input min-h-28" required value={members} onChange={event => setMembers(event.target.value)} placeholder={'@alice\n@bob\n0x1234…'} />
          <span className="block mt-2 text-xs text-[#A8B0BE]">Enter one verified JANUS username or wallet address per line. Do not include yourself.</span>
        </label>
        {error && <p role="alert" className="text-sm text-amber-300">{error}</p>}
        <div className="flex gap-3"><button type="button" className="janus-secondary flex-1" disabled={busy} onClick={() => setCreating(false)}>Cancel</button><button className="janus-primary flex-1" disabled={busy}>{busy ? 'Creating…' : 'Create group'}</button></div>
      </form>
    </Dialog>}
  </div>
}