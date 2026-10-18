# JANUS Implementation Status

_Against the four-part brief. Last updated: 2026-10-18._

---

## DONE

| Item | Brief ref |
|---|---|
| Dark brand shell: Midnight, Ivory, Cobalt, Steel palette | §2 |
| Space Grotesk + DM Sans + JetBrains Mono fonts | §2 |
| SVG logo symbol (crescent pair — shape still being refined) | §2 |
| JANUS wordmark (symbol + lettering) | §2 |
| Landing page: hero, tagline, four feature cards, network badge, CTA | §4 |
| Responsive app shell: fixed header, max-w-md single-column | §3/4 |
| Floating bottom nav: Wallet, Activity, Inbox, Groups, Settings | §4 |
| Safe-area insets, reduced-motion CSS | §3 |
| ConnectKit external wallet connection (injected — MetaMask etc.) | §5 |
| Wallet screen: live USDC ERC-20 balance on Arc mainnet | §7 |
| Send modal: recipient, amount, note, review row, chain check, writeContract, success/error, explorer link, Done button | §8 |
| Receive modal: address display, copy button | §8 |
| Activity screen: filter chips, signed-out state, empty state | §14 |
| Inbox screen: signed-out state, empty state | §13 |
| Groups screen: signed-out state, empty state, New group placeholder | §12 |
| Settings screen: connected address, copy, explorer link, Disconnect | §5/7 |
| Arc mainnet (chain ID 5042) throughout | §16 |
| Lint + typecheck passing, dev server running | — |

---

## NOT YET IMPLEMENTED

### Authentication (§5)
- [ ] Email login
- [ ] Google login
- [ ] Passkey registration + returning sign-in (distinct from first-time)
- [ ] Session expiry and account-switching handling
- [ ] Logout → landing page navigation (currently Disconnect just clears wagmi state)
- _Preferred: Privy. Needs install + Arc mainnet support verification before wiring._

### Profiles and usernames (§6)
- [ ] Username creation, uniqueness enforcement
- [ ] Wallet ↔ username association
- [ ] Username resolution in all lists (activity, splits, requests, groups)
- [ ] Shortened-address fallback when no profile exists
- [ ] Prevent unauthorized profile edits
- _Requires backend (Supabase preferred — see below)._

### Payment requests and public links (§9)
- [ ] Generate shareable payment request URL
- [ ] QR code for payment request (distinct from wallet-receive QR)
- [ ] Request status: unpaid / pending / paid / cancelled
- [ ] Public request page usable without login
- [ ] Prevent duplicate payment on single-use requests
- [ ] No localhost in shared URLs

### Named and open bill splits (§10)
- [ ] Named split: select participants by username/address, track contributions
- [ ] Open split: total + share count + public link
- [ ] Share arithmetic (integer rounding, shares sum to total)
- [ ] Last-share concurrency protection
- [ ] Organizer contribution tracking
- [ ] "Settled" label tied to real settlement rule
- [ ] Distinction between direct-settlement splits and escrow purchases

### Refundable shared purchases — contract + UI (§11)
- [ ] **Policy decision needed first**: organizer-only release vs. participant-approved release
- [ ] Solidity escrow contract: Funding → Funded → Released / Cancelled / Expired states
- [ ] Contribution tracking per wallet, target + per-share limits
- [ ] Release: only after full funding, by organizer
- [ ] Cancellation: blocks release + future contributions, preserves refund entitlements
- [ ] Expiry: deadline for funded and underfunded purchases
- [ ] Refund mechanism: claimable refund (recommended) + optional batch/automation
- [ ] Double-refund prevention
- [ ] Events for indexing and recovery
- [ ] Contract tests (Foundry)
- [ ] UI: creation form, state display, contribute, release, cancel, claim refund

### Groups (§12)
- [ ] Create / name group
- [ ] Add/remove participants, membership list
- [ ] Group-scoped splits and purchases
- [ ] Group activity feed
- [ ] Membership and editing permissions

### Inbox (§13)
- [ ] Payment request notifications
- [ ] Split invitations
- [ ] Group invitations
- [ ] Purchase state-change updates (funded, released, cancelled)
- [ ] Refund available / sent notifications
- [ ] Each item links to actionable detail

### Activity indexing and recovery (§14)
- [ ] Index sends/receives from chain events
- [ ] Index split payments, purchase contributions, release, cancellation, refunds
- [ ] Stable tx/event IDs (no duplicates on re-index)
- [ ] Backfill from contract events after interrupted writes
- [ ] Show description, username, amount, status, timestamp, explorer link
- [ ] Manual refresh + auto-refresh after confirmation

### Backend and authorization (§15)
- [ ] Supabase project: profiles, wallet associations, group membership, request/split/purchase metadata, notifications, indexed activity
- [ ] Row-level security policies
- [ ] Privy JWT → Supabase auth integration
- [ ] Server-side ownership checks for protected mutations
- [ ] Privileged keys (Supabase service role, etc.) kept server-side only
- [ ] Idempotent indexing writes
- _Neither Supabase nor Privy is currently installed or wired._

### Settings (§5/7)
- [ ] Profile & username edit screen (wired to backend)
- [ ] Notification preferences
- [ ] Security settings (passkey management)

### QR codes (§8/9)
- [ ] Wallet-receive QR (address)
- [ ] Payment-request QR (request URL)
- [ ] Clear labelling: receive QR vs. request QR
- [ ] Verify decoded payload matches destination on another device
- _Needs `qrcode.react` or equivalent installed._

### Mainnet deployment (§20)
- [ ] Escrow contract deployed to Arc mainnet
- [ ] Contract address recorded in AGENTS.md
- [ ] Real USDC transaction through the contract as evidence
- [ ] Public app URL (Netlify / HF / Vercel)
- [ ] Public repository
- [ ] Arc Studio project URL preserved
- [ ] Hackathon submission evidence package

---

## KEY DECISIONS STILL OPEN

1. **Escrow release policy**: organizer-only after full funding (recommended default) OR participant-approved? Must be decided before the contract is written.
2. **Refund mechanism**: claimable-refund path (each contributor submits their own tx) is the reliable baseline. Batch/automatic refunds need an explicit automation service — do you want to build one?
3. **Authentication provider**: Privy is preferred in the brief but needs Arc mainnet support verified. If Privy is unavailable or too complex, WalletConnect + ConnectKit (already working) covers external wallets only.
4. **Backend**: Supabase is preferred. Do you have an existing Supabase project, or should one be scaffolded from scratch?

---

## BUILD SEQUENCE (remaining)

| Stage | Work |
|---|---|
| 2 | QR code library, payment request UI + public link |
| 3 | Privy auth, Supabase backend, profiles, usernames |
| 4 | Named splits, open splits, activity indexing |
| 5 | Escrow contract (after policy decision), tests, deploy |
| 6 | Groups, inbox, notifications |
| 7 | Full reconciliation, error recovery, production hardening |
| 8 | Mainnet deploy, submission evidence |
