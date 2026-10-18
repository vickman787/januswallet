import { ConnectKitButton } from 'connectkit'
import { JanusWordmark } from './JanusLogo'

interface HeaderProps {
  minimal?: boolean
}

export default function Header({ minimal = false }: HeaderProps) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4"
      style={{
        height: '60px',
        background: 'rgba(11, 13, 18, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <JanusWordmark size={28} />

      {!minimal && (
        <ConnectKitButton.Custom>
          {({ isConnected, show, address, truncatedAddress }) => (
            <button
              onClick={show}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
              style={{
                background: isConnected
                  ? 'rgba(77, 107, 255, 0.12)'
                  : '#4D6BFF',
                color: isConnected ? '#C8CDD6' : '#fff',
                border: isConnected
                  ? '1px solid rgba(77, 107, 255, 0.3)'
                  : 'none',
                minHeight: '36px',
              }}
            >
              {isConnected ? (
                <>
                  <span
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ background: '#22C55E' }}
                  />
                  <span className="mono text-xs" style={{ color: '#C8CDD6' }}>
                    {truncatedAddress ?? (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '')}
                  </span>
                </>
              ) : (
                'Connect'
              )}
            </button>
          )}
        </ConnectKitButton.Custom>
      )}
    </header>
  )
}
