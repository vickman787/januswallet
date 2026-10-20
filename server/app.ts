import { createPublicClient, http, parseEventLogs } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { hasExpectedTransfer } from '../src/lib/payments'
import { createTokenVerifier, createStore } from './core'
import { createHandler } from './handler'
import { createProductStore } from './products'

const arcUsdc = '0x3600000000000000000000000000000000000000' as const
const testnetPurchase = '0xbcae6c22c0c3c2509f920613a4900065bfe00442'
const purchaseCreatedAbi = [{
  type: 'event', name: 'PurchaseCreated',
  inputs: [
    { name: 'purchaseId', type: 'bytes32', indexed: true },
    { name: 'organizer', type: 'address', indexed: true },
    { name: 'recipient', type: 'address', indexed: true },
    { name: 'targetAmount', type: 'uint256', indexed: false },
    { name: 'fundingDeadline', type: 'uint40', indexed: false },
    { name: 'releaseDeadline', type: 'uint40', indexed: false },
  ],
}] as const

export function createJanusHandler() {
  const serverKey = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const required = ['PRIVY_APP_ID', 'SUPABASE_URL', 'JANUS_ORIGIN'] as const
  const missing: string[] = required.filter(name => !process.env[name]?.trim())
  if (!serverKey) missing.push('SUPABASE_SECRET_KEY')
  if (missing.length) throw new Error(`Account API not configured. Set: ${missing.join(', ')}`)

  const origin = new URL(process.env.JANUS_ORIGIN!).origin
  if (origin !== process.env.JANUS_ORIGIN || (!origin.startsWith('https://') && !['localhost', '127.0.0.1'].includes(new URL(origin).hostname))) {
    throw new Error('JANUS_ORIGIN must be an exact HTTPS origin, or local development origin.')
  }
  const database = new URL(process.env.SUPABASE_URL!)
  if (database.protocol !== 'https:') throw new Error('SUPABASE_URL must use HTTPS.')

  const client = createPublicClient({ chain: arc, transport: http(undefined, { timeout: 10000, retryCount: 1 }) })
  const testnetClient = createPublicClient({ chain: arcTestnet, transport: http(undefined, { timeout: 10000, retryCount: 1 }) })

  return createHandler({
    origin,
    store: createStore(database.origin, serverKey!),
    products: createProductStore(database.origin, serverKey!),
    verifyToken: createTokenVerifier(process.env.PRIVY_APP_ID!, process.env.PRIVY_VERIFICATION_KEY),
    verifyWallet: (message, signature, address) => client.verifySiweMessage({ message, signature, address, domain: new URL(origin).host }),
    verifyTransfer: async (hash, from, to, amount) => {
      const receipt = await client.getTransactionReceipt({ hash })
      return receipt.status === 'success' && hasExpectedTransfer(receipt.logs, arcUsdc, from, to, amount)
    },
    verifyPurchaseCreation: async input => {
      const expected = input.chainId === 5042002 ? testnetPurchase : process.env.JANUS_PURCHASE_ADDRESS?.trim().toLowerCase()
      if (!expected || input.contract.toLowerCase() !== expected) return false
      const purchaseClient = input.chainId === 5042002 ? testnetClient : client
      const receipt = await purchaseClient.getTransactionReceipt({ hash: input.hash })
      if (receipt.status !== 'success') return false
      const events = parseEventLogs({ abi: purchaseCreatedAbi, eventName: 'PurchaseCreated', logs: receipt.logs })
      return events.some(event => event.address.toLowerCase() === expected &&
        event.args.purchaseId?.toLowerCase() === input.purchaseId.toLowerCase() &&
        event.args.organizer?.toLowerCase() === input.organizer.toLowerCase() &&
        event.args.recipient?.toLowerCase() === input.recipient.toLowerCase() &&
        event.args.targetAmount === input.target &&
        Number(event.args.fundingDeadline) === input.fundingDeadline &&
        Number(event.args.releaseDeadline) === input.releaseDeadline)
    },
  })
}