import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let pendingPrompt: InstallPromptEvent | null = null
let installed = false
const subscribers = new Set<() => void>()
const notify = () => subscribers.forEach(callback => callback())

if (typeof window !== 'undefined') {
  installed = window.matchMedia('(display-mode: standalone)').matches
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault()
    pendingPrompt = event as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    pendingPrompt = null
    notify()
  })
}

export default function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const [canPrompt, setCanPrompt] = useState(Boolean(pendingPrompt))
  const [isInstalled, setIsInstalled] = useState(installed)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const update = () => {
      setCanPrompt(Boolean(pendingPrompt))
      setIsInstalled(installed)
    }
    subscribers.add(update)
    update()
    return () => { subscribers.delete(update) }
  }, [])

  if (isInstalled) return compact ? null : <p className="text-xs text-[#A8B0BE]">JANUS is already installed on this device.</p>

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
      if (choice.outcome === 'dismissed') setShowHelp(true)
    } catch {
      setShowHelp(true)
    }
  }

  const isAndroid = /Android/i.test(navigator.userAgent)
  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent)
  const instructions = isIOS
    ? 'Open januswallet.xyz in Safari, tap Share, then Add to Home Screen.'
    : isAndroid
      ? 'In Chrome, tap ⋮ at the top right, then Install app or Install and create shortcut. If JANUS is already installed, check your app drawer.'
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
