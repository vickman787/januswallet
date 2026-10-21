export type JanusGroup = { id: string; organizer_id: string; name: string; description: string; created_at: string }
export type JanusMembership = { group_id: string; profile_id: string; role: string; status: string }
export type JanusGroupMember = JanusMembership & { username: string; display_name: string }
export type JanusGroupsData = { groups: JanusGroup[]; memberships: JanusMembership[]; members: JanusGroupMember[] }

export function participantInputs(value: string) {
  return value.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean)
}

export function visibleJanusGroups(data?: JanusGroupsData) {
  if (!data) return []
  const membershipByGroup = new Map(data.memberships.map(item => [item.group_id, item]))
  return data.groups.filter(group => {
    const membership = membershipByGroup.get(group.id)
    return membership?.role === 'organizer' || membership?.status === 'accepted'
  })
}

export function participantsForGroup(data: JanusGroupsData, groupId: string, maximum: number) {
  const group = visibleJanusGroups(data).find(item => item.id === groupId)
  const membership = data.memberships.find(item => item.group_id === groupId)
  if (!group || !membership) throw new Error('This group is no longer available to your account.')
  const roster = data.members.filter(item => item.group_id === groupId)
  const accepted = roster.filter(item => item.status === 'accepted' && item.profile_id !== membership.profile_id)
  if (!accepted.length) throw new Error('This group has no other accepted members yet.')
  if (accepted.length > maximum) throw new Error('This group has more than ' + maximum + ' eligible members.')
  return {
    group,
    entries: accepted.map(item => '@' + item.username),
    excluded: Math.max(0, roster.length - accepted.length - 1),
  }
}

export function mergeGroupParticipants(current: string, previousGroupEntries: string[], nextGroupEntries: string[]) {
  const previous = new Set(previousGroupEntries.map(item => item.toLowerCase()))
  const manual = participantInputs(current).filter(item => !previous.has(item.toLowerCase()))
  const unique = new Map<string, string>()
  for (const item of [...manual, ...nextGroupEntries]) {
    const key = item.toLowerCase()
    if (!unique.has(key)) unique.set(key, item)
  }
  return [...unique.values()].join('\n')
}