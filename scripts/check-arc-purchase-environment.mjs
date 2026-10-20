/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-member-access, typescript/no-unsafe-argument -- oxlint does not load Node globals for this standalone .mjs script */
import process from 'node:process'
import { createPublicClient, http, isAddress } from 'viem'
import { arc, arcTestnet } from 'viem/chains'

const USDC = '0x3600000000000000000000000000000000000000'
const target = process.argv[2] ?? 'testnet'
const contract = process.argv[3]
const chain = target === 'mainnet' ? arc : target === 'testnet' ? arcTestnet : undefined
if (!chain) throw new Error('Usage: node scripts/check-arc-purchase-environment.mjs <testnet|mainnet> [contract-address]')
if (contract && !isAddress(contract)) throw new Error('Contract address is invalid.')

const client = createPublicClient({ chain, transport: http() })
const [chainId, code, decimals] = await Promise.all([
  client.getChainId(),
  client.getCode({ address: USDC }),
  client.readContract({ address: USDC, abi: [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }], functionName: 'decimals' }),
])
if (chainId !== chain.id) throw new Error(`RPC returned chain ${chainId}; expected ${chain.id}.`)
if (!code || code === '0x') throw new Error('Canonical Arc USDC interface has no code.')
if (decimals !== 6) throw new Error(`Canonical Arc USDC returned ${decimals} decimals; expected 6.`)

const result = { network: chain.name, chainId, rpc: chain.rpcUrls.default.http[0], usdc: USDC, usdcDecimals: decimals }
if (contract) {
  const contractCode = await client.getCode({ address: contract })
  if (!contractCode || contractCode === '0x') throw new Error('JanusPurchase address has no deployed code.')
  const configuredUsdc = await client.readContract({ address: contract, abi: [{ type: 'function', name: 'ARC_USDC', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }], functionName: 'ARC_USDC' })
  if (configuredUsdc.toLowerCase() !== USDC.toLowerCase()) throw new Error(`JanusPurchase reports unexpected USDC address ${configuredUsdc}.`)
  Object.assign(result, { janusPurchase: contract, configuredUsdc })
}
console.log(JSON.stringify(result, null, 2))