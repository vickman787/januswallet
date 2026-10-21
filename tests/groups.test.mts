import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeGroupParticipants, participantsForGroup, visibleJanusGroups, type JanusGroupsData } from '../src/lib/groups'

const groupId = '11111111-1111-4111-8111-111111111111'
const data: JanusGroupsData = {
  groups: [
    { id: groupId, organizer_id: 'self', name: 'Testers', description: '', created_at: '2026-10-21T00:00:00Z' },
    { id: '22222222-2222-4222-8222-222222222222', organizer_id: 'other', name: 'Pending', description: '', created_at: '2026-10-21T00:00:00Z' },
  ],
  memberships: [
    { group_id: groupId, profile_id: 'self', role: 'organizer', status: 'accepted' },
    { group_id: '22222222-2222-4222-8222-222222222222', profile_id: 'self', role: 'member', status: 'invited' },
  ],
  members: [
    { group_id: groupId, profile_id: 'self', role: 'organizer', status: 'accepted', username: 'janus', display_name: 'Janus' },
    { group_id: groupId, profile_id: 'bob', role: 'member', status: 'accepted', username: 'bob', display_name: 'Bob' },
    { group_id: groupId, profile_id: 'carol', role: 'member', status: 'invited', username: 'carol', display_name: 'Carol' },
    { group_id: groupId, profile_id: 'dave', role: 'member', status: 'declined', username: 'dave', display_name: 'Dave' },
  ],
}

test('group selection exposes joined groups and only accepted other members', () => {
  assert.deepEqual(visibleJanusGroups(data).map(group => group.name), ['Testers'])
  const selection = participantsForGroup(data, groupId, 20)
  assert.deepEqual(selection.entries, ['@bob'])
  assert.equal(selection.excluded, 2)
})

test('group participant merge replaces the old group while preserving manual entries', () => {
  const merged = mergeGroupParticipants('@manual\n@bob', ['@bob'], ['@carol', '@MANUAL'])
  assert.deepEqual(merged.split('\n'), ['@manual', '@carol'])
})

test('group selection enforces the product participant limit', () => {
  assert.throws(() => participantsForGroup(data, groupId, 0), /more than 0/)
})