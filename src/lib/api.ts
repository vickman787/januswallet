import type { AuthSession } from '../auth/AccountProvider'

export async function janusApi<T>(
  auth: Pick<AuthSession, 'token'>,
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const token = await auth.token()
  if (!token) throw new Error('Sign in again to continue.')
  const timeout = AbortSignal.timeout(15_000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  const response = await fetch('/api/' + path.replace(/^\/+/, ''), {
    method: options.method ?? 'GET',
    signal,
    cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('JANUS service is unavailable. Try again later.')
  }
  const result: unknown = await response.json()
  if (!response.ok) {
    throw new Error(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
      ? result.error
      : 'JANUS service is unavailable.')
  }
  return result as T
}