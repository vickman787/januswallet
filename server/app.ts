import { createPublicClient, http, parseEventLogs, type Address, type Hash } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { hasExpectedTransfer } from '../src/lib/payments.js'
import { createTokenVerifier, createStore } from './core.js'
import { createHandler } from './handler.js'
import { createProductStore, purchaseNoticeKind, type ProductPurchaseNoticeState } from './products.js'

const arcUsdc = '0x3600000000000000000000000000000000000000' as const
const testnetPurchase = '0xbcae6c22c0c3c2509f920613a4900065bfe00442'
const purchaseStateAbi = [{
  type: 'function', name: 'getPurchase', stateMutability: 'view',
  inputs: [{ name: 'purchaseId', type: 'bytes32' }],
  outputs: [
    { name: 'organizer', type: 'address' }, { name: 'recipient', type: 'address' },
    { name: 'usdcToken', type: 'address' }, { name: 'targetAmount', type: 'uint256' },
    { name: 'totalContributed', type: 'uint256' }, { name: 'fundingDeadline', type: 'uint40' },
    { name: 'releaseDeadline', type: 'uint40' }, { name: 'status', type: 'uint8' },
  ],
}, {
  type: 'function', name: 'contributionOf', stateMutability: 'view',
  inputs: [{ name: 'purchaseId', type: 'bytes32' }, { name: 'contributor', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}, {
  type: 'function', name: 'isRefundClaimed', stateMutability: 'view',
  inputs: [{ name: 'purchaseId', type: 'bytes32' }, { name: 'contributor', type: 'address' }],
  outputs: [{ name: '', type: 'bool' }],
}] as const

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
    purchaseNoticeStates: async (purchases, wallets, profileId) => {
      const states: ProductPurchaseNoticeState[] = []
      for (let offset = 0; offset < purchases.length; offset += 6) {
        const batch = await Promise.allSettled(purchases.slice(offset, offset + 6).map(async purchase => {
          const expected = purchase.chain_id === 5042002 ? testnetPurchase : process.env.JANUS_PURCHASE_ADDRESS?.trim().toLowerCase()
          if (!expected || purchase.contract_address.toLowerCase() !== expected) throw new Error('Unexpected purchase contract.')
          const purchaseClient = purchase.chain_id === 5042002 ? testnetClient : client
          const contract = purchase.contract_address as Address
          const purchaseId = purchase.onchain_id as Hash
          const current = await purchaseClient.readContract({
            address: contract, abi: purchaseStateAbi, functionName: 'getPurchase', args: [purchaseId],
          })
          const status = Number(current[7])
          const role = purchase.organizer_id === profileId ? 'organizer' : 'participant'
          let contribution = 0n
          let refundClaimed = false
          if (role === 'participant' && wallets.length) {
            if (status === 3 || status === 4) {
              const contributions = await Promise.all(wallets.map(async wallet => {
                const [amount, claimed] = await Promise.all([
                  purchaseClient.readContract({ address: contract, abi: purchaseStateAbi, functionName: 'contributionOf', args: [purchaseId, wallet] }),
                  purchaseClient.readContract({ address: contract, abi: purchaseStateAbi, functionName: 'isRefundClaimed', args: [purchaseId, wallet] }),
                ])
                return { amount: BigInt(amount), claimed }
              }))
              contribution = contributions.reduce((sum, item) => sum + (item.claimed ? 0n : item.amount), 0n)
              refundClaimed = contribution === 0n && contributions.some(item => item.amount > 0n)
            } else if (status === 0) {
              const amounts = await Promise.all(wallets.map(wallet =>
                purchaseClient.readContract({ address: contract, abi: purchaseStateAbi, functionName: 'contributionOf', args: [purchaseId, wallet] })))
              contribution = amounts.reduce((sum, amount) => sum + BigInt(amount), 0n)
            }
          }
          return {
            purchaseId: purchase.id,
            kind: purchaseNoticeKind({
              role,
              status,
              target: BigInt(current[3]),
              funded: BigInt(current[4]),
              fundingDeadline: Number(current[5]),
              releaseDeadline: Number(current[6]),
              contribution,
              refundClaimed,
              now: Math.floor(Date.now() / 1000),
            }),
          } satisfies ProductPurchaseNoticeState
        }))
        for (const item of batch) if (item.status === 'fulfilled') states.push(item.value)
      }
      return states
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