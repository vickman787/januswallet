self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})
self.addEventListener('push', event => {
  if (!event.data) return
  let message
  try { message = event.data.json() } catch { return }
  if (!message || typeof message.title !== 'string' || typeof message.body !== 'string' ||
      typeof message.url !== 'string') return
  const destination = new URL(message.url, self.location.origin)
  if (destination.origin !== self.location.origin) return
  event.waitUntil(self.registration.showNotification(message.title.slice(0, 120), {
    body: message.body.slice(0, 240),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: message.url,
    data: { url: destination.href },
  }))
})

self.addEventListener('notificationclick', event => {
  const destination = new URL(event.notification.data?.url || '/', self.location.origin)
  if (destination.origin !== self.location.origin) return
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin)
    if (existing) {
      try {
        const target = existing.url === destination.href ? existing : await existing.navigate(destination.href)
        if (target) {
          await target.focus()
          return
        }
      } catch {
        // Some browsers refuse to navigate an existing tab from a notification.
      }
    }
    const opened = await self.clients.openWindow(destination.href)
    if (opened) await opened.focus()
  })())
  event.notification.close()
})
