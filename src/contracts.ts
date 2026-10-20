/**
 * JANUS contract config — Arc Mainnet
 *
 * After deploying JanusPurchase.sol to Arc Mainnet (chain ID 5042):
 *   1. Set VITE_JANUS_PURCHASE_ADDRESS in .env.local to the verified deployed address.
 *   2. Restart the dev server so the env var is picked up.
 *
 * Prepare deployment with Arc Foundry and an external signer. Verify the
 * compiled bytecode, Arc USDC interface, chain ID, gas and explorer receipt.
 * Never put a deployer private key in browser configuration.
 *
 * IMPORTANT: mainnet — real USDC, irreversible. Review the contract and run
 * all tests before deploying. Arc Studio does not deploy to mainnet on your behalf.
 */

import janusPurchaseAbiJson from './abi/janusPurchaseAbi.json'

export const ARC_MAINNET_ID = 5042
export const ARC_TESTNET_ID = 5042002
export const JANUS_PURCHASE_TESTNET_ADDRESS = '0xbcae6c22c0c3c2509f920613a4900065bfe00442' as const

// Set VITE_JANUS_PURCHASE_ADDRESS=0x... in .env.local after verifying the deployment
export const JANUS_PURCHASE_ADDRESS =
  (import.meta.env.VITE_JANUS_PURCHASE_ADDRESS as `0x${string}` | undefined) ?? undefined

export const JANUS_PURCHASE_ABI = janusPurchaseAbiJson

/** Purchase status enum matching the contract */
export enum PurchaseStatus {
  Funding   = 0,
  Funded    = 1,
  Released  = 2,
  Cancelled = 3,
  Expired   = 4,
}

export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  [PurchaseStatus.Funding]:   'Funding',
  [PurchaseStatus.Funded]:    'Funded',
  [PurchaseStatus.Released]:  'Released',
  [PurchaseStatus.Cancelled]: 'Cancelled',
  [PurchaseStatus.Expired]:   'Expired',
}
