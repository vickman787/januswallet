import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { createHandler } from '../server/handler.ts'
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

test('group member Leave and organizer Remove accept bodyless DELETE requests', async () => {
  const calls: string[] = []
  const store = {
    async profile(subject: string) { return { id: subject, username: subject, display_name: subject } },
  } as import('../server/core.ts').Store
  const products = {
    async leaveGroup(id: string, memberId: string) { calls.push('leave:' + id + ':' + memberId); return true },
    async removeGroupMember(id: string, organizerId: string, memberId: string) {
      calls.push('remove:' + id + ':' + organizerId + ':' + memberId); return true
    },
  } as import('../server/products.ts').ProductStore
  const origin = 'http://localhost:5173'
  const server = createServer(createHandler({
    origin, store, products,
    verifyToken: async header => header === 'Bearer owner' ? 'owner' : 'member',
    verifyWallet: async () => false,
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const endpoint = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  try {
    const leave = await fetch(endpoint + '/api/groups/' + groupId + '/membership', {
      method: 'DELETE', headers: { Origin: origin, Authorization: 'Bearer member', 'Content-Type': 'application/json' },
    })
    assert.equal(leave.status, 200)
    assert.deepEqual(await leave.json(), { left: true })
    const remove = await fetch(endpoint + '/api/groups/' + groupId + '/members/22222222-2222-4222-8222-222222222222', {
      method: 'DELETE', headers: { Origin: origin, Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    })
    assert.equal(remove.status, 200)
    assert.deepEqual(await remove.json(), { removed: true })
    assert.deepEqual(calls, [
      'leave:' + groupId + ':member',
      'remove:' + groupId + ':owner:22222222-2222-4222-8222-222222222222',
    ])
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})


test('accepting a group invitation notifies only existing accepted members', async () => {
  const { createProductStore } = await import('../server/products.ts')
  const original = globalThis.fetch
  const calls: { path: string; method: string; body: unknown }[] = []
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname + new URL(String(input)).search
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) as unknown : null
    calls.push({ path, method, body })
    const result = method === 'PATCH'
      ? [{ group_id: groupId }]
      : method === 'GET'
        ? [{ profile_id: 'owner' }, { profile_id: 'existing' }, { profile_id: 'new-member' }]
        : []
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const store = createProductStore('https://database.example', 'test-server-key')
    assert.equal(await store.respondGroup(groupId, 'new-member', 'accepted'), true)
    const inserted = calls.find(call => call.method === 'POST')
    assert.ok(inserted)
    assert.match(inserted.path, /\/rest\/v1\/notifications$/)
    const notices = inserted.body as { recipient_id: string; kind: string; resource_id: string; event_key: string }[]
    assert.deepEqual(notices.map(item => item.recipient_id), ['owner', 'existing'])
    assert.ok(notices.every(item => item.kind === 'group_joined' && item.resource_id === groupId))
    assert.ok(notices.every(item => item.event_key.startsWith('group_joined:new-member:')))

    calls.length = 0
    assert.equal(await store.respondGroup(groupId, 'new-member', 'declined'), true)
    assert.equal(calls.some(call => call.method === 'POST'), false)
  } finally { globalThis.fetch = original }
})
