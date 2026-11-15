import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const script = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const splitUrl = 'https://januswallet.xyz/#split=123e4567-e89b-12d3-a456-426614174000'

type FakeClient = {
  url: string
  navigate?: (url: string) => Promise<FakeClient | null>
  focus: () => Promise<void>
}

async function clickNotification(existing: FakeClient[] = []) {
  const calls: string[] = []
  const listeners = new Map<string, (event: Record<string, unknown>) => void>()
  const opened: FakeClient = { url: splitUrl, focus: async () => { calls.push('focus-opened') } }
  const scope = {
    location: { origin: 'https://januswallet.xyz' },
    clients: {
      matchAll: async () => existing,
      openWindow: async (url: string) => { calls.push('open:' + url); return opened },
    },
    addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) => listeners.set(name, handler),
  }
  runInNewContext(script, { self: scope, URL })
  let pending: Promise<unknown> | undefined
  listeners.get('notificationclick')?.({
    notification: { data: { url: splitUrl }, close: () => calls.push('close') },
    waitUntil: (promise: Promise<unknown>) => { pending = promise },
  })
  assert.ok(pending, 'click handler should keep the service worker alive')
  await pending
  return calls
}

test('notification opens the exact split when no JANUS tab is open', async () => {
  assert.deepEqual(await clickNotification(), ['close', 'open:' + splitUrl, 'focus-opened'])
})

test('notification reuses an open JANUS tab when navigation works', async () => {
  const calls: string[] = []
  const target: FakeClient = { url: splitUrl, focus: async () => { calls.push('focus-target') } }
  const existing: FakeClient = {
    url: 'https://januswallet.xyz/',
    navigate: async url => { calls.push('navigate:' + url); return target },
    focus: async () => { calls.push('focus-existing') },
  }
  const result = await clickNotification([existing])
  assert.deepEqual(calls, ['navigate:' + splitUrl, 'focus-target'])
  assert.deepEqual(result, ['close'])
})

test('notification opens the split when existing-tab navigation fails', async () => {
  const existing: FakeClient = {
    url: 'https://januswallet.xyz/',
    navigate: async () => { throw new Error('navigation refused') },
    focus: async () => {},
  }
  assert.deepEqual(await clickNotification([existing]), ['close', 'open:' + splitUrl, 'focus-opened'])
})

test('notification opens the split when navigation returns no window', async () => {
  const existing: FakeClient = {
    url: 'https://januswallet.xyz/',
    navigate: async () => null,
    focus: async () => {},
  }
  assert.deepEqual(await clickNotification([existing]), ['close', 'open:' + splitUrl, 'focus-opened'])
})