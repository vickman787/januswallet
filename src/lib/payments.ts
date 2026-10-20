import { getAddress, isAddress, parseUnits, zeroAddress, erc20Abi, parseEventLogs, type Address, type Log } from 'viem'

/** Reject precision loss and scientific notation rather than rounding silently. */
export function parseUsdcInput(value: string): bigint {
  const input = value.trim()
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(input)) {
    throw new Error('Enter a positive USDC amount with up to 6 decimal places.')
  }
  const raw = parseUnits(input, 6)
  if (raw <= 0n || raw > 2n ** 256n - 1n) throw new Error('Amount is outside the supported range.')
  return raw
}

export function paymentRecipient(value: string): `0x${string}` {
  const input = value.trim()
  if (!isAddress(input) || input.toLowerCase() === zeroAddress) {
    throw new Error('Enter a valid, non-zero wallet address.')
  }
  return getAddress(input)
}

/** Remainder units go to the first shares; every share is an integer token unit. */
export function splitUsdc(total: bigint, count: number): bigint[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000 || total < BigInt(count)) {
    throw new Error('Each of 1–1000 shares must contain at least one USDC base unit.')
  }
  const n = BigInt(count)
  return Array.from({ length: count }, (_, index) => total / n + (BigInt(index) < total % n ? 1n : 0n))
}

/** A successful receipt alone does not prove the requested USDC transfer happened. */
export function hasExpectedTransfer(logs: Log[], token: Address, from: Address, to: Address, amount: bigint): boolean {
  return parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs }).some(log =>
    log.address.toLowerCase() === token.toLowerCase() &&
    log.args.from.toLowerCase() === from.toLowerCase() &&
    log.args.to.toLowerCase() === to.toLowerCase() && log.args.value === amount)
}
