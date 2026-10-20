import { isAddress, type Address } from 'viem'
import { getUsdc } from '../onchain-facts'
import { ARC_MAINNET_ID } from '../contracts'

// Validate the exported network fact instead of casting arbitrary configuration.
const token = getUsdc(ARC_MAINNET_ID)
export const ARC_USDC_ADDRESS: Address | undefined = token && isAddress(token.address) ? token.address : undefined
