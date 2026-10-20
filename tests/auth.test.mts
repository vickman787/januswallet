import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { customFetch, generateKeyPair, exportJWK, exportSPKI, SignJWT } from 'jose'
import { privateKeyToAccount } from 'viem/accounts'
import { verifyMessage } from 'viem'
import { ApiError, createTokenVerifier, createStore, profileInput, type Store, type Challenge, type Profile } from '../server/core.ts'
import { createHandler } from '../server/handler.ts'

const keys = await generateKeyPair('ES256')
const publicKey = await exportSPKI(keys.publicKey)
const verifyToken = createTokenVerifier('test-app', publicKey)
async function token(subject = 'did:privy:alice', audience = 'test-app', expiry = '1h', issuer = 'privy.io') {
  return new SignJWT({}).setProtectedHeader({ alg: 'ES256' }).setSubject(subject).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expiry).sign(keys.privateKey)
}
test('JWT rejects missing, expired, wrong audience, issuer, subject and signature', async () => {
  await assert.rejects(verifyToken(undefined), ApiError)
  for (const args of [['did:privy:alice', 'other'], ['did:privy:alice', 'test-app', '-1s'], ['did:privy:alice', 'test-app', '1h', 'other'], ['alice']]) {
    await assert.rejects(verifyToken(`Bearer ${await token(...args)}`), ApiError)
  }
  const other = await generateKeyPair('ES256')
  const forged = await new SignJWT({}).setProtectedHeader({ alg: 'ES256' }).setSubject('did:privy:alice').setIssuer('privy.io').setAudience('test-app').setIssuedAt().setExpirationTime('1h').sign(other.privateKey)
  await assert.rejects(verifyToken(`Bearer ${forged}`), ApiError)
  assert.equal(await verifyToken(`Bearer ${await token()}`), 'did:privy:alice')
})
test('profile validation normalizes usernames and excludes posted ownership', () => {
  assert.deepEqual(profileInput({ username: ' Alice_1 ', displayName: ' Alice ', owner_subject: 'attacker' }), { username: 'alice_1', display_name: 'Alice' })
  for (const input of [null, {}, { username: 'bad name', displayName: 'x' }, { username: 'alice', displayName: ' ' }]) assert.throws(() => profileInput(input), ApiError)
})
test('API enforces identity, origin, body limits, wallet proof and replay isolation', async () => {
  const profiles = new Map<string, Profile>()
  const challenges = new Map<string, Challenge & { subject: string }>()
  const associations = new Map<string, string>()
  const store: Store = {
    async profile(subject) { return profiles.get(subject) ?? null },
    async publicProfile(username) {
      const profile = [...profiles.values()].find(value => value.username === username)
      if (!profile) return null
      const address = [...associations].find(([, owner]) => owner === profile.id)?.[0]
      return address ? { username: profile.username, display_name: profile.display_name, address, chain_id: 5042 } : null
    },
    async saveProfile(subject, fields) { const row = { id: subject, ...fields }; profiles.set(subject, row); return row },
    async wallets(id) { return [...associations].filter(([, owner]) => owner === id).map(([address]) => ({ address, chain_id: 5042 })) },
    async challenge(subject, data) { challenges.set(data.id, { ...data, subject }) },
    async consume(subject, id) {
      const value = challenges.get(id)
      if (!value || value.subject !== subject) return null
      challenges.delete(id); return value
    },
    async associate(id, address) {
      if (associations.has(address) && associations.get(address) !== id) throw new ApiError(409, 'Already associated.')
      associations.set(address, id)
    },
  }
  const origin = 'http://localhost:5173'
  const server = createServer(createHandler({ origin, store, verifyToken,
    verifyWallet: (message, signature, address) => verifyMessage({ message, signature, address }),
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const alice = await token(); const bob = await token('did:privy:bob')
  const wallet = privateKeyToAccount(`0x${'11'.repeat(32)}`)
  async function request(path: string, method = 'GET', body?: unknown, bearer = alice, requestOrigin = origin) {
    return fetch(`${endpoint}/api/${path}`, { method, headers: { Authorization: `Bearer ${bearer}`, Origin: requestOrigin, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  }
  try {
    assert.equal((await request('me', 'GET', undefined, 'invalid')).status, 401)
    assert.equal((await request('users/alice', 'GET', undefined, 'invalid')).status, 404)
    assert.equal((await request('profile', 'PUT', { username: 'alice', displayName: 'Alice' }, alice, '')).status, 403)
    assert.equal((await request('profile', 'PUT', { username: 'alice', displayName: 'Alice' }, alice, 'https://evil.example')).status, 403)
    assert.equal((await request('profile', 'PUT', { username: 'alice', displayName: 'x'.repeat(9000) })).status, 413)
    assert.equal((await request('wallet/challenge', 'POST', { address: wallet.address })).status, 409)
    assert.equal((await request('profile', 'PUT', { username: 'alice', displayName: 'Alice', owner_subject: 'did:privy:bob' })).status, 200)
    assert.equal((await (await request('me', 'GET', undefined, bob)).json()).profile, null)
    await request('profile', 'PUT', { username: 'bob', displayName: 'Bob' }, bob)
    const challenge = await (await request('wallet/challenge', 'POST', { address: wallet.address })).json()
    assert.match(challenge.message, /localhost:5173 wants you to sign in/)
    assert.match(challenge.message, /Chain ID: 5042/)
    const signature = await wallet.signMessage({ message: challenge.message })
    assert.equal((await request('wallet/verify', 'POST', { id: challenge.id, signature }, bob)).status, 400)
    const results = await Promise.all([request('wallet/verify', 'POST', { id: challenge.id, signature }), request('wallet/verify', 'POST', { id: challenge.id, signature })])
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400])
    assert.equal((await (await request('me')).json()).wallets.length, 1)
    const publicAlice = await (await request('users/alice', 'GET', undefined, 'invalid')).json()
    assert.equal(publicAlice.address, wallet.address.toLowerCase())
    assert.equal((await (await request('me', 'GET', undefined, bob)).json()).wallets.length, 0)
    const expired = await (await request('wallet/challenge', 'POST', { address: wallet.address })).json()
    challenges.get(expired.id)!.expires_at = new Date(0).toISOString()
    assert.equal((await request('wallet/verify', 'POST', { id: expired.id, signature })).status, 400)
    const wrong = await (await request('wallet/challenge', 'POST', { address: wallet.address })).json()
    const otherWallet = privateKeyToAccount(`0x${'22'.repeat(32)}`)
    const wrongSignature = await otherWallet.signMessage({ message: wrong.message })
    assert.equal((await request('wallet/verify', 'POST', { id: wrong.id, signature: wrongSignature })).status, 400)
    assert.equal((await request('wallet/verify', 'POST', { id: wrong.id, signature: await wallet.signMessage({ message: wrong.message }) })).status, 400)
    const bobChallenge = await (await request('wallet/challenge', 'POST', { address: wallet.address }, bob)).json()
    assert.equal((await request('wallet/verify', 'POST', { id: bobChallenge.id, signature: await wallet.signMessage({ message: bobChallenge.message }) }, bob)).status, 409)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('database adapter scopes reads, prevents wallet reassignment and rejects malformed responses', async () => {
  const original = globalThis.fetch
  const calls: { url: string; init?: RequestInit }[] = []
  let data: unknown = []
  let status = 200
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init })
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const store = createStore('https://database.example', 'test-server-key')
    assert.equal(await store.profile('did:privy:alice'), null)
    assert.equal(new Headers(calls.at(-1)!.init!.headers).get('Authorization'), 'Bearer test-server-key')
    assert.match(calls.at(-1)!.url, /owner_subject=eq.did%3Aprivy%3Aalice/)
    data = [{ id: 'profile-alice', username: 'alice', display_name: 'Alice' }]
    await store.saveProfile('did:privy:alice', { username: 'alice', display_name: 'Alice' })
    assert.equal(JSON.parse(String(calls.at(-1)!.init!.body)).owner_subject, 'did:privy:alice')
    data = [{ profile_id: 'profile-bob' }]
    await assert.rejects(store.associate('profile-alice', '0x1111111111111111111111111111111111111111'), (error: unknown) => error instanceof ApiError && error.status === 409)
    assert.equal(calls.at(-1)!.init!.method, 'GET')
    data = []
    await store.consume('did:privy:alice', 'challenge-id')
    assert.deepEqual(JSON.parse(String(calls.at(-1)!.init!.body)), { challenge_id: 'challenge-id', subject_id: 'did:privy:alice' })
    data = { malformed: 'not an array' }
    await assert.rejects(store.wallets('profile-alice'), ApiError)
    const modern = createStore('https://database.example', 'sb_secret_test-only')
    data = []
    await modern.profile('did:privy:alice')
    assert.equal(new Headers(calls.at(-1)!.init!.headers).get('apikey'), 'sb_secret_test-only')
    assert.equal(new Headers(calls.at(-1)!.init!.headers).get('Authorization'), null)
    status = 503; data = { secret: 'must-not-be-echoed' }
    await assert.rejects(store.profile('did:privy:alice'), (error: unknown) => error instanceof ApiError && !error.message.includes('must-not-be-echoed'))
  } finally { globalThis.fetch = original }
})
test('Privy JWKS verification caches keys, refreshes for a new signing key and fails closed', async () => {
  const first = await generateKeyPair('ES256')
  const second = await generateKeyPair('ES256')
  const keyOne = { ...await exportJWK(first.publicKey), kid: 'first', alg: 'ES256', use: 'sig' }
  const keyTwo = { ...await exportJWK(second.publicKey), kid: 'second', alg: 'ES256', use: 'sig' }
  let published = [keyOne]
  let requests = 0
  const verify = createTokenVerifier('test-app', undefined, { cooldownDuration: 0, [customFetch]: async (url) => {
    assert.equal(String(url), 'https://auth.privy.io/api/v1/apps/test-app/jwks.json')
    requests++
    return new Response(JSON.stringify({ keys: published }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } })
  async function issue(privateKey: CryptoKey, kid: string, audience = 'test-app') {
    return new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid }).setSubject('did:privy:alice').setIssuer('privy.io').setAudience(audience).setIssuedAt().setExpirationTime('1h').sign(privateKey)
  }
  const firstToken = await issue(first.privateKey, 'first')
  assert.equal(await verify(`Bearer ${firstToken}`), 'did:privy:alice')
  assert.equal(await verify(`Bearer ${firstToken}`), 'did:privy:alice')
  assert.equal(requests, 1, 'Known signing key should be cached')
  published = [keyTwo]
  assert.equal(await verify(`Bearer ${await issue(second.privateKey, 'second')}`), 'did:privy:alice')
  assert.equal(requests, 2, 'Unknown signing key should trigger refresh')
  await assert.rejects(verify(`Bearer ${await issue(second.privateKey, 'second', 'other-app')}`), (error: unknown) => error instanceof ApiError && error.status === 401)
  await assert.rejects(verify(`Bearer ${await issue(first.privateKey, 'second')}`), (error: unknown) => error instanceof ApiError && error.status === 401)
  const unavailable = createTokenVerifier('test-app', undefined, { [customFetch]: () => Promise.resolve(new Response('unavailable', { status: 503 })) })
  await assert.rejects(unavailable(`Bearer ${firstToken}`), (error: unknown) => error instanceof ApiError && error.status === 503)
  assert.throws(() => createTokenVerifier('../other-app'), /Invalid Privy App ID/)
})