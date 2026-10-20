import type { Address } from 'viem'
import { paymentRecipient } from './payments'

export type ResolvedRecipient = {
  address: Address
  username?: string
  displayName?: string
}

export async function resolveRecipientInput(input: string, signal?: AbortSignal): Promise<ResolvedRecipient> {
  try {
    return { address: paymentRecipient(input) }
  } catch {
    const username = input.trim().replace(/^@/, '').toLowerCase()
    if (!/^[a-z0-9_]{1,32}$/.test(username)) throw new Error('Enter a valid wallet address or @username.')
    const timeout = AbortSignal.timeout(10000)
    const response = await fetch('/api/users/' + encodeURIComponent(username), {
      cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    let result: unknown
    try { result = await response.json() } catch { throw new Error('Username lookup is unavailable.') }
    if (!response.ok) {
      throw new Error(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
        ? result.error : 'Username lookup failed.')
    }
    if (!result || typeof result !== 'object' || !('address' in result) || typeof result.address !== 'string' ||
      !('username' in result) || result.username !== username ||
      !('chainId' in result) || result.chainId !== 5042) throw new Error('Username lookup returned an invalid wallet.')
    return {
      address: paymentRecipient(result.address),
      username: '@' + username,
      displayName: 'displayName' in result && typeof result.displayName === 'string' ? result.displayName : undefined,
    }
  }
}