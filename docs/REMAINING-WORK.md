# JANUS — Remaining Implementation Work

This document is a handoff brief for the next agent or developer continuing this build.
It maps every unfinished item against the original four-part specification.

---

## Project state at handoff

| Layer | Status |
|---|---|
| Brand tokens, global CSS, fonts | Done |
| SVG logo symbol | Placeholder SVG exists — **needs replacement with real asset** (see §1) |
| App shell: header, bottom nav, routing | Done |
| Landing page | Done |
| Wallet screen: live USDC balance, Send, Receive | Done (Arc Mainnet, chain ID 5042) |
| Activity screen | Scaffold only — no real data |
| Inbox screen | Scaffold only |
| Groups screen | Scaffold only |
| Settings screen | Done (address display, copy, explorer link, disconnect) |
| Escrow contract `JanusPurchase.sol` | Written, reviewed, 53/53 tests pass — **not yet deployed** |
| Contract ABI wired into `src/contracts.ts` | Done — address env var slot ready |
| Authentication (email / Google / passkey) | Not started |
| Backend / database | Not started |
| Splits (named + open) | Not started |
| Shared purchases UI | Not started |
| QR codes | Not started |
| Payment requests + public links | Not started |

---

## Tech stack

- **Framework:** React 18 + TypeScript + Vite
- **Chain:** Arc Mainnet (chain ID 5042), USDC at `0x3600000000000000000000000000000000000000` (6 decimals)
- **Wallet connection:** wagmi v2 + ConnectKit (external wallets only today)
- **Styling:** Tailwind CSS v3, custom JANUS brand tokens in `src/index.css`
- **Fonts:** Space Grotesk (display), DM Sans (body), JetBrains Mono (addresses)
- **Onchain helpers:** `src/onchain-facts.ts`, `src/onchain-money.ts`, `src/onchain-wait.ts`
- **Contract:** `contracts/JanusPurchase.sol` (Foundry, OpenZeppelin 5.1.0, Paris EVM)
- **Contract ABI:** `src/abi/janusPurchaseAbi.json`
- **Contract config:** `src/contracts.ts` — exports `JANUS_PURCHASE_ADDRESS`, `JANUS_PURCHASE_ABI`, `PurchaseStatus`

---

## 1. Logo asset

**Problem:** The SVG in `src/components/JanusLogo.tsx` is a hand-coded approximation that does not match the real JANUS symbol (two crescent/D shapes facing each other — silver left, cobalt right, each with a notch on the inner concave edge).

**Fix:** Replace the SVG paths in `JanusSymbol` and `JanusWordmark` components with the real production asset.
- Preferred: drop the real SVG file into `src/assets/janus-symbol.svg` and import it as `<img src={janusSymbolSvg} />` inside `JanusSymbol`.
- The `JanusWordmark` component should render the symbol alongside the word "JANUS" in Space Grotesk 600 weight, ivory `#F1F3F2`.
- Used in: `src/screens/LandingScreen.tsx` (hero, size 88px) and `src/components/Header.tsx` (compact, size 28px).

---

## 2. Authentication

**Spec refs:** Brief 1 §5

**What is needed:**
- Email + Google login via Privy (`@privy-io/react-auth`)
- External wallet connection (already works via ConnectKit)
- Optional passkey: register only after another method is authenticated; returning sign-in via passkey only if previously registered
- After logout/disconnect: clear session, navigate to landing page
- Single auth control in the header — no duplicate connect buttons elsewhere

**Implementation notes:**
- Install `@privy-io/react-auth` and wrap the app in `PrivyProvider` alongside the existing `WagmiProvider`.
- Privy's Arc Mainnet support should be verified before shipping — confirm chain ID 5042 is in their supported list.
- The ConnectKit button in `src/components/Header.tsx` should be replaced or augmented by a unified Privy + external wallet button.
- On disconnect: call `privy.logout()` (for embedded wallets) or `wagmi disconnect()` (for external wallets) and navigate to the landing page.
- Passkey registration: offer after successful email/Google login, with clear explanation. Do not claim passkey sign-in until registration has been completed.

---

## 3. Backend and database (Supabase)

**Spec refs:** Brief 3 §15

**What is needed:**
- Supabase project with row-level security
- Tables: `profiles`, `wallet_associations`, `payment_requests`, `splits`, `split_participants`, `purchases`, `purchase_contributions`, `groups`, `group_members`, `activity`, `notifications`
- Privy JWT used to authorize Supabase RLS policies (via `supabase.auth.setSession` or custom JWT verification)
- Server-side API routes (Vite proxy to a small Express/Hono backend, or Supabase Edge Functions) for privileged mutations
- No privileged keys in browser code

**Profile / username rules:**
- Usernames: unique, lowercase alphanumeric + underscore, max 32 chars
- Normalized wallet address lookups (lowercase)
- Wallet associations verified on-chain (signed message) — do not assume address ownership from auth alone

**Key backend endpoints needed:**
- `POST /profiles` — create/update username and display name
- `GET /profiles/:usernameOrAddress` — resolve profile
- `POST /payment-requests` — create request, return shareable ID
- `GET /payment-requests/:id` — public, no auth required
- `POST /splits` — create named or open split
- `GET /splits/:id` — public
- `POST /purchases` — create purchase metadata (mirrors on-chain creation)
- `POST /activity` — idempotent write indexed from chain events
- `GET /activity?address=` — paginated activity for an address

---

## 4. QR codes

**Spec refs:** Brief 2 §8, §9

**What is needed:**
- Install `qrcode.react` (or equivalent)
- In `src/screens/WalletScreen.tsx` `ReceiveModal`: replace the placeholder with a real QR encoding the wallet address
- In payment request screens: QR encodes the public payment URL (not localhost — must use the deployed app origin)
- Label wallet-receive QR codes differently from payment-request QR codes
- Verify the decoded payload matches the intended destination

---

## 5. Payment requests and public links

**Spec refs:** Brief 2 §9

**What is needed:**
- Create a payment request: amount, optional description, requester identity, recipient address
- Store in Supabase, return a short ID
- Public shareable URL: `https://<app-origin>/pay/<requestId>`
- QR code of the URL
- Public page at `/pay/:id` — works for signed-out visitors, shows amount + requester, allows payment
- States: unpaid → pending confirmation → paid
- Prevent duplicate payment (mark paid after first confirmed tx)
- Explorer link after payment confirmed
- Never generate a localhost URL

**Frontend files to create:**
- `src/screens/PaymentRequestScreen.tsx` — create request form
- `src/screens/PublicPayScreen.tsx` — public payment page (no auth required)
- Add routes for `/pay/:id` — consider using `react-router-dom` or a simple hash-router

---

## 6. Named and open bill splits

**Spec refs:** Brief 2 §10

**Named split:**
- Organizer selects participants by username or address
- Sets total amount; per-share amount = total / participant count (exact integer division — document rounding rule)
- Each participant pays their share directly to the organizer wallet (no escrow)
- Track confirmed payments per participant
- Show funded progress, contributor identities, status

**Open split:**
- Organizer sets total and number of available shares
- Public link; anyone can claim a share
- Last-share concurrency: handle simultaneous claims (check remaining shares server-side before confirming)
- Payment goes directly to organizer wallet (not escrow)
- Display contributors using resolved usernames

**Contract note:** Named and open splits use direct USDC transfer (no new contract needed — reuse the standard ERC-20 transfer flow). The `JanusPurchase.sol` contract is only for refundable shared purchases.

**Frontend files to create:**
- `src/screens/SplitCreateScreen.tsx`
- `src/screens/SplitDetailScreen.tsx`
- `src/screens/SplitPublicScreen.tsx` (open split public link)

---

## 7. Refundable shared purchases UI

**Spec refs:** Brief 2 §11

**The contract is already written and tested.** Deploy it first (see §10 below), then build the UI.

**Confirmed policies:**
- Organizer releases only after full funding (`totalContributed >= targetAmount`)
- Releases must happen before `releaseDeadline`
- Refunds are individually claimable (pull model) — contributors call `claimRefund(purchaseId)`
- `markExpired` is permissionless — anyone can call once deadlines pass

**Frontend files to create:**
- `src/screens/PurchaseCreateScreen.tsx` — create purchase (title, description, target, deadlines, recipient)
- `src/screens/PurchaseDetailScreen.tsx` — show state, progress, contribute button, release/cancel/markExpired/claimRefund buttons
- `src/components/PurchaseCard.tsx` — compact card for lists

**Key UI flows to implement:**

1. **Create:** form → `createPurchase(recipient, targetAmount, fundingDeadline, releaseDeadline)`. Requires USDC approval first (the contract pulls USDC from contributors, not the organizer, so no approval needed at creation).
2. **Contribute:** approve USDC spend on `JanusPurchase` address → `contribute(purchaseId, amount)`. Enforce `amount <= remainingTarget`.
3. **Release:** organizer only, status Funded, within window → `release(purchaseId)`.
4. **Cancel:** organizer only, status Funding or Funded → `cancel(purchaseId)`.
5. **Mark expired:** anyone, past deadline → `markExpired(purchaseId)`.
6. **Claim refund:** contributor, status Cancelled or Expired, not yet claimed → `claimRefund(purchaseId)`. Show "Refund available" vs "Refund claimed" — never show "Refund sent" automatically.

**Contract address:** set `VITE_JANUS_PURCHASE_ADDRESS` in `.env` after deploying. The slot is already wired in `src/contracts.ts`.

---

## 8. Groups

**Spec refs:** Brief 3 §12

**What is needed:**
- Create group: name, optional description
- Add participants by username or address
- View group members
- Create splits or purchases scoped to a group
- View group activity
- Membership and editing permissions enforced server-side
- `src/screens/GroupsScreen.tsx` is currently a scaffold — wire to real Supabase data

---

## 9. Activity screen and indexing

**Spec refs:** Brief 3 §14

**What is needed:**
- `src/screens/ActivityScreen.tsx` is currently a scaffold — wire to real data
- Index `JanusPurchase` events from Arc Mainnet: `Contributed`, `Released`, `Cancelled`, `Expired`, `RefundClaimed`
- Index standard ERC-20 `Transfer` events for direct sends/receives
- Use stable identifiers (tx hash + log index) to prevent duplicate records
- Backfill from contract deployment block (not from block 0)
- Display: description, username/address resolved, amount, status, timestamp, explorer link
- Manual refresh button; auto-refresh after confirmed transactions

**Indexer notes:**
- Arc Mainnet RPC: `https://rpc.mainnet.arc.io`
- USDC contract: `0x3600000000000000000000000000000000000000`
- `JanusPurchase` contract address: set after deploy
- Do not start from block 0 — resolve deployment block from tx receipt first
- Batch `eth_getLogs` calls in bounded ranges (e.g. 2000 blocks per call)

---

## 10. Contract deployment to Arc Mainnet

**This must be done by the developer from their own wallet — Arc Studio cannot sign mainnet transactions.**

```bash
forge create contracts/JanusPurchase.sol:JanusPurchase \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --verify \
  --verifier blockscout \
  --verifier-url https://explorer.arc.io/api
```

After deploying:
1. Set `VITE_JANUS_PURCHASE_ADDRESS=0x<address>` in `.env`
2. Record the address and deployment tx hash in `AGENTS.md`
3. Restart the dev server

**Pre-deploy checklist:**
- All 53 Foundry tests pass (`forge test`)
- Contract reviewed against the brief's acceptance checks (§19 of Brief 4)
- Deploying wallet funded with real USDC on Arc Mainnet for gas
- Deployer address is NOT the organizer of any purchase — keep the deployer key separate from the application wallet

---

## 11. Inbox wiring

**Spec refs:** Brief 3 §13

`src/screens/InboxScreen.tsx` is currently a scaffold. Wire it to Supabase notifications:
- Payment requests received
- Split invitations
- Group invitations
- Purchase contribution updates
- Refund available notifications
- Link each notification to the relevant detail screen

---

## 12. Public app deployment and submission evidence

**Spec refs:** Brief 4 §20

**Required for hackathon submission:**
- Public live app URL (deploy to Netlify, Vercel, or Hugging Face via the Integrations menu)
- Public GitHub repository
- Arc Mainnet contract address for `JanusPurchase`
- Example USDC transaction hash and explorer link on Arc Mainnet
- Arc Studio project URL
- Walkthrough video demonstrating Studio usage and the working payment flow

---

## File map

```
src/
  App.tsx                    — thin composition root, routing by screen state
  config.ts                  — wagmi config, Arc Mainnet (chain 5042)
  contracts.ts               — JanusPurchase address, ABI, PurchaseStatus enum
  onchain-facts.ts           — chain/USDC facts (generated, do not edit)
  onchain-money.ts           — amount helpers (generated, do not edit)
  onchain-wait.ts            — tx state machine (generated, do not edit)
  abi/
    janusPurchaseAbi.json    — compiled ABI from contracts/out/
  components/
    BottomNav.tsx            — floating nav bar (Wallet/Activity/Inbox/Groups/Settings)
    Header.tsx               — fixed header with wallet button
    JanusLogo.tsx            — JanusSymbol + JanusWordmark (SVG needs replacement)
  screens/
    LandingScreen.tsx        — landing page, hero, features
    WalletScreen.tsx         — balance, Send modal, Receive modal
    ActivityScreen.tsx       — scaffold
    InboxScreen.tsx          — scaffold
    GroupsScreen.tsx         — scaffold
    SettingsScreen.tsx       — address, copy, explorer, disconnect

contracts/
  JanusPurchase.sol          — escrow contract (reviewed, tested, not deployed)
  test/
    JanusPurchase.t.sol      — 53 Foundry tests (all pass)
  test-helpers/
    MockERC20.sol            — mock USDC for tests
  out/
    JanusPurchase.sol/
      JanusPurchase.json     — compiled artifact

docs/
  implementation-status.md  — earlier status snapshot
  REMAINING-WORK.md          — this file
```

---

## Environment variables

Add to `.env` (Vite reads at startup — restart the dev server after changes):

```
VITE_JANUS_PURCHASE_ADDRESS=   # set after deploying JanusPurchase to Arc Mainnet
VITE_PRIVY_APP_ID=             # from Privy dashboard (when implementing auth)
VITE_SUPABASE_URL=             # from Supabase project settings
VITE_SUPABASE_ANON_KEY=        # from Supabase project settings
```

Backend-only secrets (never `VITE_`-prefixed):
```
SUPABASE_SERVICE_ROLE_KEY=     # server-side only
```
