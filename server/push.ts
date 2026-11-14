import * as webPush from 'web-push'
import { ApiError } from './core.js'

export type PushSubscriptionInput = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}
type PushRow = { id: string; profile_id: string; endpoint: string; p256dh: string; auth: string }
export type PushMessage = { eventKey: string; title: string; body: string; url: string }

const pushHosts = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'])

function validEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (pushHosts.has(url.hostname) || url.hostname.endsWith('.push.apple.com') ||
        url.hostname.endsWith('.notify.windows.com'))
  } catch { return false }
}

export function parsePushSubscription(value: unknown): PushSubscriptionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Invalid push subscription.')
  const input = value as Record<string, unknown>
  const keys = input.keys
  if (!validEndpoint(input.endpoint) || !keys || typeof keys !== 'object' || Array.isArray(keys)) {
    throw new ApiError(400, 'Invalid push subscription.')
  }
  const pair = keys as Record<string, unknown>
  if (typeof pair.p256dh !== 'string' || typeof pair.auth !== 'string' ||
    !/^[A-Za-z0-9_-]{80,100}$/.test(pair.p256dh) || !/^[A-Za-z0-9_-]{16,40}$/.test(pair.auth)) {
    throw new ApiError(400, 'Invalid push subscription keys.')
  }
  return { endpoint: input.endpoint, keys: { p256dh: pair.p256dh, auth: pair.auth } }
}

function rows(value: unknown): PushRow[] {
  if (!Array.isArray(value)) throw new ApiError(503, 'Push storage is unavailable.')
  return value as PushRow[]
}

export function createPushService(databaseUrl: string, databaseKey: string, publicKey: string, privateKey: string, origin: string) {
  webPush.setVapidDetails('mailto:notifications@januswallet.xyz', publicKey, privateKey)
  async function request(path: string, method = 'GET', body?: unknown, prefer?: string): Promise<unknown> {
    const response = await fetch(databaseUrl + '/rest/v1/' + path, {
      method,
      headers: {
        apikey: databaseKey,
        ...(databaseKey.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + databaseKey }),
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new ApiError(503, 'Push storage is unavailable.')
    const content = await response.text()
    return content ? JSON.parse(content) as unknown : null
  }
  return {
    publicKey,
    async ready() { await request('push_subscriptions?select=id&limit=0') },
    async subscribe(profileId: string, subscription: PushSubscriptionInput) {
      const existing = rows(await request('push_subscriptions?endpoint=eq.' + encodeURIComponent(subscription.endpoint) + '&select=id,profile_id,endpoint,p256dh,auth'))
      if (existing.length && existing[0].profile_id !== profileId) {
        throw new ApiError(409, 'This browser is already subscribed to another JANUS account. Disable its notifications first.')
      }
      if (existing.length) {
        await request('push_subscriptions?id=eq.' + existing[0].id + '&profile_id=eq.' + encodeURIComponent(profileId), 'PATCH', {
          p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, updated_at: new Date().toISOString(),
        })
      } else {
        await request('push_subscriptions', 'POST', {
          profile_id: profileId, endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh, auth: subscription.keys.auth,
        })
      }
    },
    async unsubscribe(profileId: string, endpoint: string) {
      if (!validEndpoint(endpoint)) throw new ApiError(400, 'Invalid push subscription.')
      await request('push_subscriptions?profile_id=eq.' + encodeURIComponent(profileId) + '&endpoint=eq.' + encodeURIComponent(endpoint), 'DELETE')
    },
    async send(profileIds: string[], message: PushMessage) {
      const recipients = [...new Set(profileIds)]
      if (!recipients.length) return
      const destination = new URL(message.url, origin)
      if (!message.url.startsWith('/') || destination.origin !== origin) throw new Error('Push URL must be same-origin.')
      const subscriptions = rows(await request('push_subscriptions?profile_id=in.(' + recipients.join(',') + ')&select=id,profile_id,endpoint,p256dh,auth&limit=500'))
      await Promise.allSettled(subscriptions.map(async subscription => {
        const reserved = rows(await request('push_deliveries?on_conflict=subscription_id,event_key&select=id', 'POST', {
          subscription_id: subscription.id, event_key: message.eventKey,
        }, 'resolution=ignore-duplicates,return=representation'))
        if (!reserved.length) return
        try {
          await webPush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          }, JSON.stringify({ title: message.title, body: message.body, url: destination.href }), {
            TTL: 24 * 60 * 60, timeout: 5000,
          })
        } catch (error) {
          const status = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : null
          if (status === 404 || status === 410) {
            await request('push_subscriptions?id=eq.' + subscription.id, 'DELETE')
          } else {
            await request('push_deliveries?id=eq.' + reserved[0].id, 'DELETE')
          }
        }
      }))
    },
  }
}

export type PushService = ReturnType<typeof createPushService>
