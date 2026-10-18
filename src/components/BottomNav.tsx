import { Wallet, ArrowLeftRight, Inbox, Users, Settings } from 'lucide-react'

export type Screen = 'wallet' | 'activity' | 'inbox' | 'groups' | 'settings'

interface BottomNavProps {
  active: Screen
  onChange: (s: Screen) => void
  inboxCount?: number
}

const tabs: { id: Screen; label: string; Icon: typeof Wallet }[] = [
  { id: 'wallet',   label: 'Wallet',   Icon: Wallet },
  { id: 'activity', label: 'Activity', Icon: ArrowLeftRight },
  { id: 'inbox',    label: 'Inbox',    Icon: Inbox },
  { id: 'groups',   label: 'Groups',   Icon: Users },
  { id: 'settings', label: 'Settings', Icon: Settings },
]

export default function BottomNav({ active, onChange, inboxCount = 0 }: BottomNavProps) {
  return (
    <nav
      className="bottom-nav-bar fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around"
      style={{
        background: 'rgba(11, 13, 18, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        height: '72px',
      }}
      role="navigation"
      aria-label="Main navigation"
    >
      {tabs.map(({ id, label, Icon }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="relative flex flex-col items-center gap-1 px-4 py-2 min-w-[44px] min-h-[44px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF] rounded-lg"
            aria-current={isActive ? 'page' : undefined}
            aria-label={label}
          >
            <span className="relative">
              <Icon
                size={22}
                strokeWidth={isActive ? 2 : 1.5}
                style={{ color: isActive ? '#4D6BFF' : '#77808F', transition: 'color 0.15s' }}
              />
              {id === 'inbox' && inboxCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-white tabnum"
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    minWidth: '14px',
                    height: '14px',
                    background: '#4D6BFF',
                    padding: '0 3px',
                  }}
                >
                  {inboxCount > 9 ? '9+' : inboxCount}
                </span>
              )}
            </span>
            <span
              className="text-[10px] font-medium transition-colors duration-150 select-none"
              style={{ color: isActive ? '#4D6BFF' : '#77808F' }}
            >
              {label}
            </span>
            {isActive && (
              <span
                className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-t-full"
                style={{ width: '20px', height: '2px', background: '#4D6BFF' }}
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}
