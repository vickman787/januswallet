import SplitActivity from '../components/SplitActivity'
import PurchaseActivity from '../components/PurchaseActivity'
import TransferActivity from '../components/TransferActivity'

export default function ActivityScreen() {
  return <section className="p-4 space-y-7">
    <h1 className="display text-xl font-semibold">Activity</h1>
    <SplitActivity />
    <PurchaseActivity />
    <section className="space-y-3"><h2 className="display font-semibold">USDC transfers</h2><TransferActivity /></section>
  </section>
}