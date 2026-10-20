import { QRCodeSVG } from 'qrcode.react'
import { paymentRecipient } from '../lib/payments'

export default function WalletQR({ address }: { address: string }) {
  const destination = paymentRecipient(address)
  return (
    <figure className="flex flex-col items-center gap-3 my-4">
      <div className="bg-white p-2 rounded-xl">
        <QRCodeSVG value={destination} size={200} level="M" marginSize={4}
          title={`Wallet receive address: ${destination}`} />
      </div>
      <figcaption className="text-sm text-center text-[#C8CDD6]">Wallet receive QR · Arc USDC</figcaption>
    </figure>
  )
}
