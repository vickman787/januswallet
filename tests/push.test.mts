import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { ApiError, type Store } from '../server/core.ts'
import { createHandler } from '../server/handler.ts'
import { parsePushSubscription, type PushService } from '../server/push.ts'

const origin = 'http://localhost:5173'
const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/example',
  keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) },
}

test('push subscription validation blocks arbitrary endpoints and malformed keys', () => {
  assert.deepEqual(parsePushSubscription(subscription), subscription)
  for (const endpoint of [
    'http://fcm.googleapis.com/fcm/send/example',
    'https://localhost/internal',
    'https://fcm.googleapis.com.evil.example/collect',
    'https://user:secret@fcm.googleapis.com/send',
  ]) {
    assert.throws(() => parsePushSubscription({ ...subscription, endpoint }), ApiError)
  }
  assert.throws(() => parsePushSubscription({ ...subscription, keys: { p256dh: 'bad', auth: 'B'.repeat(22) } }), ApiError)
})

test('push routes require signed-in profile and bind subscriptions to that profile', async () => {
  const calls: { profileId: string; endpoint: string }[] = []
  const store = {
    async profile(subject: string) {
      return subject === 'alice' ? { id: 'alice-profile', username: 'alice', display_name: 'Alice' } : null
    },
  } as Store
  const push = {
    publicKey: 'public-test-key',
    async ready() {},
    async subscribe(profileId: string, value: typeof subscription) {
      calls.push({ profileId, endpoint: value.endpoint })
    },
    async unsubscribe(profileId: string, endpoint: string) {
      calls.push({ profileId, endpoint })
    },
  } as PushService
  const server = createServer(createHandler({
    origin, store, push,
    verifyToken: async header => {
      if (header === 'Bearer alice') return 'alice'
      if (header === 'Bearer bob') return 'bob'
      throw new ApiError(401, 'Sign in again.')
    },
    verifyWallet: async () => false,
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port
  const request = (path: string, bearer: string, requestOrigin = origin, body?: unknown) =>
    fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: bearer, Origin: requestOrigin, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
  try {
    assert.equal((await request('/api/push/config', 'Bearer alice')).status, 200)
    assert.equal((await request('/api/push/config', 'Bearer bob')).status, 409)
    assert.equal((await request('/api/push/subscribe', 'Bearer bob', origin, { subscription })).status, 409)
    assert.equal((await request('/api/push/subscribe', 'Bearer alice', 'https://evil.example', { subscription })).status, 403)
    assert.equal((await request('/api/push/subscribe', 'Bearer alice', origin, { subscription: { ...subscription, endpoint: 'https://localhost/internal' } })).status, 400)
    assert.equal((await request('/api/push/subscribe', 'Bearer alice', origin, { subscription })).status, 200)
    assert.equal((await request('/api/push/unsubscribe', 'Bearer alice', origin, { endpoint: subscription.endpoint })).status, 200)
    assert.deepEqual(calls, [
      { profileId: 'alice-profile', endpoint: subscription.endpoint },
      { profileId: 'alice-profile', endpoint: subscription.endpoint },
    ])
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
