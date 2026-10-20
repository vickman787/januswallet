import { createRemoteJWKSet, errors, importSPKI, jwtVerify, type RemoteJWKSetOptions } from 'jose'
import { getAddress, zeroAddress } from 'viem'

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export function profileInput(value: unknown) {
  const input = value as Record<string, unknown> | null
  if (!input || typeof input.username !== 'string' || typeof input.displayName !== 'string') throw new ApiError(400, 'Enter a username and display name.')
  const username = input.username.trim().toLowerCase()
  const display_name = input.displayName.trim()
  if (!/^[a-z0-9_]{1,32}$/.test(username) || display_name.length < 1 || display_name.length > 80) throw new ApiError(400, 'Use 1 to 32 letters, numbers or underscores for your username and a display name up to 80 characters.')
  return { username, display_name }
}
export function walletAddress(value: unknown) {
  try {
    if (typeof value !== 'string') throw new Error()
    const address = getAddress(value)
    if (address === zeroAddress) throw new Error()
    return address
  } catch { throw new ApiError(400, 'Enter a valid wallet address.') }
}
export function createTokenVerifier(appId: string, publicKey?: string, jwksOptions: RemoteJWKSetOptions = {}) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(appId)) throw new Error('Invalid Privy App ID.')
  const key = publicKey?.trim()
    ? importSPKI(publicKey.replace(/\\n/g, '\n'), 'ES256')
    : createRemoteJWKSet(new URL('https://auth.privy.io/api/v1/apps/' + encodeURIComponent(appId) + '/jwks.json'), { timeoutDuration: 5000, ...jwksOptions })
  return async (authorization: string | undefined) => {
    if (!authorization?.startsWith('Bearer ') || authorization.length > 8192) throw new ApiError(401, 'Sign in again.')
    try {
      const { payload } = await jwtVerify(authorization.slice(7), await key, {
        algorithms: ['ES256'], issuer: 'privy.io', audience: appId,
        requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: '1h',
      })
      if (!payload.sub?.startsWith('did:privy:')) throw new Error()
      return payload.sub
    } catch (error) {
      if (error instanceof TypeError || error instanceof errors.JWKSTimeout || error instanceof errors.JWKSInvalid || (error instanceof errors.JOSEError && error.code === 'ERR_JOSE_GENERIC')) throw new ApiError(503, 'Login verification is unavailable. Try again shortly.')
      throw new ApiError(401, 'Your session is invalid or expired. Sign in again.')
    }
  }
}

export type Profile = { id: string; username: string; display_name: string }
export type PublicProfile = { username: string; display_name: string; address: string; chain_id: number }
export type Challenge = { id: string; message: string; address: string; expires_at: string }
export interface Store {
  profile(subject: string): Promise<Profile | null>
  publicProfile(username: string): Promise<PublicProfile | null>
  saveProfile(subject: string, fields: ReturnType<typeof profileInput>): Promise<Profile>
  wallets(profileId: string): Promise<{ address: string; chain_id: number }[]>
  challenge(subject: string, data: Challenge): Promise<void>
  consume(subject: string, id: string): Promise<Challenge | null>
  associate(profileId: string, address: string): Promise<void>
}
function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every(item => item && typeof item === 'object' && !Array.isArray(item))) throw new ApiError(503, 'Invalid account storage response.')
  return value as Record<string, unknown>[]
}
function profileRow(row: Record<string, unknown>): Profile {
  if (typeof row.id !== 'string' || typeof row.username !== 'string' || typeof row.display_name !== 'string') throw new ApiError(503, 'Invalid profile response.')
  return { id: row.id, username: row.username, display_name: row.display_name }
}
function challengeRow(row: Record<string, unknown>): Challenge {
  if (typeof row.id !== 'string' || typeof row.address !== 'string' || typeof row.message !== 'string' || typeof row.expires_at !== 'string' || !Number.isFinite(Date.parse(row.expires_at))) throw new ApiError(503, 'Invalid verification response.')
  return { id: row.id, address: row.address, message: row.message, expires_at: row.expires_at }
}
export function createStore(url: string, key: string): Store {
  async function request(path: string, method = 'GET', body?: unknown, prefer?: string): Promise<unknown> {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      method, headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) {
      if (response.status === 409) throw new ApiError(409, 'That username or wallet is already registered.')
      throw new ApiError(503, 'Account storage is unavailable. Try again.')
    }
    const text = await response.text()
    return text ? JSON.parse(text) as unknown : null
  }
  return {
    async profile(subject) {
      const rows = records(await request(`profiles?owner_subject=eq.${encodeURIComponent(subject)}&select=id,username,display_name`))
      return rows.length ? profileRow(rows[0]) : null
    },
    async publicProfile(username) {
      const rows = records(await request('profiles?username=eq.' + encodeURIComponent(username) + '&select=id,username,display_name'))
      if (!rows.length) return null
      const profile = profileRow(rows[0])
      const wallets = records(await request('wallet_associations?profile_id=eq.' + encodeURIComponent(profile.id) + '&chain_id=eq.5042&select=address,chain_id&order=verified_at.asc&limit=1'))
      const wallet = wallets[0]
      if (!wallet || typeof wallet.address !== 'string' || wallet.chain_id !== 5042) return null
      return { username: profile.username, display_name: profile.display_name, address: wallet.address, chain_id: wallet.chain_id }
    },
    async saveProfile(subject, fields) {
      const rows = records(await request('profiles?on_conflict=owner_subject&select=id,username,display_name', 'POST', { owner_subject: subject, ...fields }, 'resolution=merge-duplicates,return=representation'))
      if (rows.length !== 1) throw new ApiError(503, 'Profile could not be saved.')
      return profileRow(rows[0])
    },
    async wallets(id) {
      return records(await request(`wallet_associations?profile_id=eq.${encodeURIComponent(id)}&select=address,chain_id`)).map(row => {
        if (typeof row.address !== 'string' || typeof row.chain_id !== 'number') throw new ApiError(503, 'Invalid wallet response.')
        return { address: row.address, chain_id: row.chain_id }
      })
    },
    async challenge(subject, data) { await request('wallet_challenges', 'POST', { ...data, owner_subject: subject }) },
    async consume(subject, id) {
      const rows = records(await request('rpc/consume_wallet_challenge', 'POST', { challenge_id: id, subject_id: subject }))
      return rows.length ? challengeRow(rows[0]) : null
    },
    async associate(id, address) {
      // Ignore a duplicate only when already associated with this profile. Never reassign ownership.
      const existing = records(await request(`wallet_associations?address=eq.${address}&select=profile_id`))
      if (existing.length) {
        if (existing[0].profile_id !== id) throw new ApiError(409, 'This wallet is already registered to another account.')
        return
      }
      await request('wallet_associations', 'POST', { profile_id: id, address, chain_id: 5042, verified_at: new Date().toISOString() })
    },
  }
}