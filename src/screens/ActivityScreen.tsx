import { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import SplitActivity from '../components/SplitActivity'
import PurchaseActivity from '../components/PurchaseActivity'
import TransferActivity from '../components/TransferActivity'

type View = 'all' | 'splits' | 'purchases' | 'transfers'
const views: { id: View; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'splits', label: 'Splits' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'transfers', label: 'Transfers' },
]

export default function ActivityScreen() {
  const [view, setView] = useState<View>('all')
  return <section className="activity-screen">
    <div className="activity-heading"><span className="dialog-kicker">YOUR HISTORY</span><h1 className="display text-2xl font-semibold mt-2">Activity</h1><p className="text-sm text-[#A8B0BE] mt-1">Track transfers, splits, and shared purchases.</p></div>
    <div className="activity-tabs" role="group" aria-label="Filter activity type">{views.map(item => <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.label}</button>)}</div>
    {(view === 'all' || view === 'splits') && <section className="activity-group" aria-label="Splits"><SplitActivity /></section>}
    {(view === 'all' || view === 'purchases') && <section className="activity-group" aria-label="Shared purchases"><PurchaseActivity /></section>}
    {(view === 'all' || view === 'transfers') && <section className="activity-group" aria-label="USDC transfers"><div className="activity-group-label"><span><ArrowLeftRight size={16} /> USDC transfers</span></div><TransferActivity /></section>}
  </section>
}
