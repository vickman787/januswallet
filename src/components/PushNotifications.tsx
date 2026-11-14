import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { useJanusAuth, type AuthSession } from '../auth/AccountProvider'
import { janusApi } from '../lib/api'

const ownerKey = 'janus-push-owner'

function supported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator &&
    'PushManager' in window && 'Notification' in window && window.isSecureContext
}

function applicationKey(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const bytes = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(bytes, char => char.charCodeAt(0))
}

export async function disablePush(auth: Pick<AuthSession, 'token'>) {
  if (!supported()) return
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager.getSubscription()
  try {
    if (subscription) {
      try {
        await janusApi(auth, 'push/unsubscribe', { method: 'POST', body: { endpoint: subscription.endpoint } })
      } finally {
        await subscription.unsubscribe()
      }
    }
  } finally {
    localStorage.removeItem(ownerKey)
  }
}

export default function PushNotifications() {
  const auth = useJanusAuth()
  const [enabled, setEnabled] = useState(false)
  const [publicKey, setPublicKey] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supported() || !auth.subject) return
    let active = true
    void (async () => {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()
      const owner = localStorage.getItem(ownerKey)
      if (subscription && owner !== auth.subject) {
        await subscription.unsubscribe()
        localStorage.removeItem(ownerKey)
      } else if (active) {
        setEnabled(Boolean(subscription && owner === auth.subject))
      }
    })().catch(() => { if (active) setEnabled(false) })
    void janusApi<{ publicKey: string }>({ token: auth.token }, 'push/config')
      .then(config => { if (active) setPublicKey(config.publicKey) })
      .catch(() => { if (active) setPublicKey('') })
    return () => { active = false }
  }, [auth.subject, auth.token])

  async function enable() {
    if (!supported() || !auth.subject || !publicKey) return
    setWorking(true); setMessage('')
    try {
      // Ask from the button gesture; browsers may reject delayed permission prompts.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Allow notifications in your browser settings to enable alerts.')
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: applicationKey(publicKey),
        })
      }
      await janusApi(auth, 'push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON() } })
      localStorage.setItem(ownerKey, auth.subject)
      setEnabled(true)
      setMessage('Alerts are enabled on this device.')
    } catch (error) {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager.getSubscription()
      await subscription?.unsubscribe()
      setMessage(error instanceof Error ? error.message : 'Could not enable notifications.')
    } finally { setWorking(false) }
  }

  async function disable() {
    setWorking(true); setMessage('')
    try {
      await disablePush(auth)
      setEnabled(false)
      setMessage('Alerts are off on this device.')
    } catch (error) {
      setEnabled(false)
      setMessage(error instanceof Error ? error.message : 'Could not update notifications.')
    } finally { setWorking(false) }
  }

  return <div className="mx-4 mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4D6BFF]/10 text-[#AFC0FF]">
        {enabled ? <Bell size={18} /> : <BellOff size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-[#F1F3F2]">Phone & browser alerts</h3>
        <p className="mt-1 text-xs text-[#A8B0BE]">Get invitations and group updates on this device.</p>
      </div>
    </div>
    {supported() && (enabled || publicKey) ? <button type="button" className="janus-secondary mt-4 w-full" disabled={working}
      onClick={() => { void (enabled ? disable() : enable()) }}>
      {working ? 'Updating…' : enabled ? 'Turn off alerts' : 'Enable alerts'}
    </button> : <p className="mt-3 text-xs text-[#A8B0BE]">
      {supported() ? 'Alerts will be available after server setup.' : 'Push alerts need a supported browser and HTTPS. On iPhone, add JANUS to your Home Screen first.'}
    </p>}
    {message && <p role="status" className="mt-2 text-xs text-[#A8B0BE]">{message}</p>}
  </div>
}
