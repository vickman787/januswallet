import { Wallet, ArrowLeftRight, Inbox, Users, Settings } from 'lucide-react'

export type Screen = 'home' | 'send' | 'activity' | 'inbox' | 'groups' | 'settings' | 'docs'

interface BottomNavProps {
  active: Screen
  onChange: (s: Screen) => void
  inboxCount?: number
}

const tabs = [
  { id: 'home', label: 'Wallet', Icon: Wallet },
  { id: 'activity', label: 'Activity', Icon: ArrowLeftRight },
  { id: 'inbox', label: 'Inbox', Icon: Inbox },
  { id: 'groups', label: 'Groups', Icon: Users },
  { id: 'settings', label: 'Settings', Icon: Settings },
] as const

export default function BottomNav({ active, onChange, inboxCount = 0 }: BottomNavProps) {
  return <nav className="bottom-nav-bar" aria-label="Main navigation">
    {tabs.map(({ id, label, Icon }) => {
      const isActive = active === id || (active === 'docs' && id === 'home') || (active === 'send' && id === 'home')
      return <button key={id} type="button" onClick={() => onChange(id)}
        className="bottom-nav-item" aria-current={isActive ? 'page' : undefined}
        aria-label={id === 'inbox' && inboxCount > 0 ? `Inbox, ${inboxCount} pending` : label}>
        <span className="relative">
          <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
          {id === 'inbox' && inboxCount > 0 && <span className="bottom-nav-count">{inboxCount > 99 ? '99+' : inboxCount}</span>}
        </span>
        <span>{label}</span>
      </button>
    })}
  </nav>
}
