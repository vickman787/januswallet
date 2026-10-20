import { JanusSymbol } from './JanusLogo'

export default function AppLoadingScreen() {
  return <div className="min-h-dvh flex items-center justify-center bg-[#0B0D12]" role="status" aria-label="Loading JANUS">
    <div className="flex flex-col items-center gap-4">
      <span className="animate-pulse"><JanusSymbol size={56} /></span>
      <p className="text-xs uppercase tracking-[0.24em] text-[#77808F]">Loading JANUS</p>
    </div>
  </div>
}