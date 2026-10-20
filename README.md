# JANUS Wallet

JANUS is an Arc Mainnet wallet for sending and receiving USDC, splitting bills by username or wallet address, organizing groups, and funding refundable shared purchases through on-chain escrow.

## Live contracts

- Network: Arc Mainnet (chain ID `5042`)
- USDC: `0x3600000000000000000000000000000000000000`
- JanusPurchase: `0x0523d830dd2c8767678f35b774ce2decf4faf2a5`

## Stack

React, Vite, TypeScript, Tailwind CSS, Privy, wagmi, viem, Supabase, Solidity, Foundry, and Vercel.

## Local development

1. Copy `.env.example` to `.env.local` for browser variables.
2. Put server-only credentials in `.env.server`.
3. Install dependencies with `bun install`.
4. Start the API with `bun run api`.
5. Start the app with `bun run dev`.

Never commit local environment files or wallet private keys.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
forge test
```

Contract deployment and Mainnet transaction evidence are documented in `docs/CONTRACT-READINESS.md`.