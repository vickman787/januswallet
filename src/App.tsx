import { useState } from 'react'
import { useAccount } from 'wagmi'
import BottomNav, { type Screen } from './components/BottomNav'
import Header from './components/Header'
import LandingScreen from './screens/LandingScreen'
import WalletScreen from './screens/WalletScreen'
import ActivityScreen from './screens/ActivityScreen'
import InboxScreen from './screens/InboxScreen'
import GroupsScreen from './screens/GroupsScreen'
import SettingsScreen from './screens/SettingsScreen'

export default function App() {
  const { isConnected } = useAccount()
  const [enteredApp, setEnteredApp] = useState(false)
  const [screen, setScreen] = useState<Screen>('wallet')

  // Show landing if not connected or user hasn't entered the app yet
  const inApp = isConnected && enteredApp

  if (!inApp) {
    return (
      <LandingScreen
        onEnterApp={() => setEnteredApp(true)}
      />
    )
  }

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: '#0B0D12' }}>
      {/* Fixed header */}
      <Header />

      {/* Main content — padded top for header, bottom for nav */}
      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingTop: '60px', paddingBottom: 'calc(72px + env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-md mx-auto w-full">
          {screen === 'wallet'   && <WalletScreen />}
          {screen === 'activity' && <ActivityScreen />}
          {screen === 'inbox'    && <InboxScreen />}
          {screen === 'groups'   && <GroupsScreen />}
          {screen === 'settings' && <SettingsScreen />}
        </div>
      </main>

      {/* Fixed bottom nav */}
      <BottomNav active={screen} onChange={setScreen} />
    </div>
  )
}
