import { paymentRecipient } from './payments'

/** Receive QRs contain a plain wallet address. Never trust a QR to set an amount or network. */
export function scannedRecipient(value: string): `0x${string}` {
  return paymentRecipient(value)
}
