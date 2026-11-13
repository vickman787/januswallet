import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let pendingPrompt: InstallPromptEvent | null = null
let installStarted = false
const subscribers = new Set<() => void>()
const notify = () => subscribers.forEach(callback => callback())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    pendingPrompt = event as InstallPromptEvent
    notify()
  })
  // On Android this fires when the dialog is accepted, before WebAPK installation finishes.
  window.addEventListener('appinstalled', () => {
    installStarted = true
    pendingPrompt = null
    notify()
  })
}

export default function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const [canPrompt, setCanPrompt] = useState(Boolean(pendingPrompt))
  const [installationStarted, setInstallationStarted] = useState(installStarted)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const update = () => {
      setCanPrompt(Boolean(pendingPrompt))
      setInstallationStarted(installStarted)
    }
    subscribers.add(update)
    update()
    return () => { subscribers.delete(update) }
  }, [])

  if (window.matchMedia('(display-mode: standalone)').matches) {
    return compact ? null : <p className="text-xs text-[#A8B0BE]">JANUS is open from your home screen.</p>
  }

  const install = async () => {
    if (!pendingPrompt) {
      setShowHelp(true)
      return
    }
    const prompt = pendingPrompt
    pendingPrompt = null
    setCanPrompt(false)
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      setShowHelp(true)
      if (choice.outcome === 'accepted') {
        installStarted = true
        setInstallationStarted(true)
      }
    } catch {
      setShowHelp(true)
    }
  }

  const isAndroid = /Android/i.test(navigator.userAgent)
  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent)
  const instructions = installationStarted && isAndroid
    ? 'Chrome accepted the install request, but Android may still be creating the app. Check your home screen and app drawer. If it stays stuck, try adding a shortcut from another browser.'
    : isIOS
      ? 'Open januswallet.xyz in Safari, tap Share, then Add to Home Screen.'
      : isAndroid
        ? 'In Chrome, tap ⋮ at the top right, then Install app or Install and create shortcut. If installation stalls, try adding a shortcut from another browser.'
        : 'Open your browser menu and choose Install JANUS or Create shortcut.'

  return (
    <div className={compact ? 'flex flex-col items-center gap-2' : 'flex flex-col gap-2'}>
      <button type="button" onClick={() => { void install() }}
        className={compact
          ? 'flex items-center gap-2 rounded-full border border-[#4D6BFF]/40 px-5 py-2.5 text-sm font-medium text-[#AFC0FF] focus-visible:ring-2 focus-visible:ring-[#4D6BFF]'
          : 'janus-secondary flex w-full items-center justify-center gap-2'}>
        <Download size={16} /> Install JANUS
      </button>
      {showHelp && <p role="status" className={compact ? 'max-w-xs text-center text-xs text-[#A8B0BE]' : 'text-xs text-[#A8B0BE]'}>
        {instructions}
      </p>}
      {!showHelp && !canPrompt && !compact && <p className="text-xs text-[#A8B0BE]">
        On Android Chrome, you can also use ⋮ → Install app.
      </p>}
    </div>
  )
}
