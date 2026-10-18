import { useAccount, useDisconnect } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { LogOut, User, Shield, Bell, HelpCircle, ExternalLink, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { buildAddressExplorerUrl } from '../onchain-facts'

const ARC_MAINNET_ID = 5042

export default function SettingsScreen() {
  const { address, isConnected, chainId } = useAccount()
  const { disconnect } = useDisconnect()
  const [copied, setCopied] = useState(false)

  const copyAddress = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    toast.success('Address copied')
    setTimeout(() => setCopied(false), 2000)
  }

  const sections = [
    {
      title: 'Account',
      items: [
        { label: 'Profile & username', Icon: User, action: () => toast.info('Profile — coming soon') },
        { label: 'Notifications',      Icon: Bell, action: () => toast.info('Notifications — coming soon') },
        { label: 'Security',           Icon: Shield, action: () => toast.info('Security — coming soon') },
      ],
    },
    {
      title: 'Support',
      items: [
        { label: 'Help & FAQ', Icon: HelpCircle, action: () => window.open('https://docs.arc.io', '_blank') },
      ],
    },
  ]

  return (
    <div className="flex flex-col pb-6">
      <div className="px-4 pt-4 pb-3">
        <h2 className="display font-semibold text-base" style={{ color: '#F1F3F2' }}>Settings</h2>
      </div>

      {/* Wallet card */}
      <div className="mx-4 mb-4 rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {isConnected && address ? (
          <>
            <div className="flex items-center gap-3 mb-3">
              <span className="flex items-center justify-center w-10 h-10 rounded-full" style={{ background: 'rgba(77,107,255,0.12)', border: '1px solid rgba(77,107,255,0.2)' }}>
                <User size={18} style={{ color: '#4D6BFF' }} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: '#F1F3F2' }}>Connected wallet</p>
                <p className="mono text-xs truncate" style={{ color: '#77808F' }}>{address}</p>
              </div>
            </div>
            <div className="flex items-center gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '12px' }}>
              <span className="flex items-center gap-1.5 text-xs" style={{ color: '#22C55E' }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#22C55E' }} />
                {chainId === ARC_MAINNET_ID ? 'Arc Mainnet' : 'Wrong network'}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => { void copyAddress() }}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
                style={{ color: '#77808F', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {copied ? <Check size={12} style={{ color: '#22C55E' }} /> : <Copy size={12} />}
                Copy address
              </button>
              <a
                href={buildAddressExplorerUrl(ARC_MAINNET_ID, address)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
                style={{ color: '#4D6BFF', border: '1px solid rgba(77,107,255,0.2)' }}
              >
                Explorer <ExternalLink size={11} />
              </a>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-sm" style={{ color: '#77808F' }}>No wallet connected</p>
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button
                  onClick={show}
                  className="px-5 py-2 rounded-full text-sm font-semibold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
                  style={{ background: '#4D6BFF', color: '#fff' }}
                >
                  Connect wallet
                </button>
              )}
            </ConnectKitButton.Custom>
          </div>
        )}
      </div>

      {/* Sections */}
      {sections.map(section => (
        <div key={section.title} className="mx-4 mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: '#4E5561', letterSpacing: '0.1em' }}>
            {section.title}
          </h3>
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
            {section.items.map(({ label, Icon, action }, i) => (
              <button
                key={label}
                onClick={action}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-[#4D6BFF]"
                style={{
                  borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                <Icon size={17} style={{ color: '#77808F' }} strokeWidth={1.6} />
                <span className="text-sm flex-1" style={{ color: '#C8CDD6' }}>{label}</span>
                <span style={{ color: '#4E5561' }}>›</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Disconnect */}
      {isConnected && (
        <div className="mx-4">
          <button
            onClick={() => disconnect()}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EF4444]"
            style={{ background: 'rgba(239,68,68,0.06)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.15)' }}
          >
            <LogOut size={16} />
            Disconnect wallet
          </button>
        </div>
      )}

      {/* Version */}
      <p className="text-center text-xs mt-6" style={{ color: '#4E5561' }}>
        JANUS · Arc Mainnet · Built with Arc Studio
      </p>
    </div>
  )
}
