/**
 * JANUS contract config — Arc Mainnet
 *
 * After deploying JanusPurchase.sol to Arc Mainnet (chain ID 5042):
 *   1. Set VITE_JANUS_PURCHASE_ADDRESS in .env to the deployed address.
 *   2. Restart the dev server so the env var is picked up.
 *
 * Deploy command (from your own wallet):
 *   forge create contracts/JanusPurchase.sol:JanusPurchase \
 *     --rpc-url https://rpc.mainnet.arc.io \
 *     --private-key $DEPLOYER_PRIVATE_KEY \
 *     --verify \
 *     --verifier blockscout \
 *     --verifier-url https://explorer.arc.io/api
 *
 * IMPORTANT: mainnet — real USDC, irreversible. Review the contract and run
 * all tests before deploying. Arc Studio does not deploy to mainnet on your behalf.
 */

import janusPurchaseAbiJson from './abi/janusPurchaseAbi.json'

export const ARC_MAINNET_ID = 5042

// Set VITE_JANUS_PURCHASE_ADDRESS=0x... in .env after deploying
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
