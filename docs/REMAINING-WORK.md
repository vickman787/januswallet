# JANUS — Remaining implementation work

Compared with the downloaded source on 18 October 2026. This is a status record,
not permission to deploy contracts, provision paid services, or send transactions.
The original handoff is preserved in the `arc-studio-baseline` Git tag.

## Verified code inventory and continuation

| Area | Actual implementation |
| --- | --- |
| Brand | Owner-supplied PNG now used faithfully in the shared logo; matching favicon. Raster source retained, not a newly invented SVG symbol. |
| Landing and shell | Existing responsive pages retained; Open wallet corrected; duplicate fixed watermark removed in favor of a footer; floating navigation and safe-area spacing improved. |
| Account lifecycle | One Privy entry offers email, Google and external wallet sign-in. The official Privy wagmi adapter supplies the active payment wallet. Account subtree resets when the subject or selected wallet changes, clearing modal/navigation state. |
| Wallet | Live ERC-20 balance query on Arc Mainnet, separate loading/unavailable/zero states, focus/periodic refresh, copy failures surfaced. |
| Send | Exact integer USDC parsing, recipient validation, full-address review, network switch, live simulation, explicit wallet confirmation, receipt and matching Transfer-event verification. Pending hash recovery is per account in browser session storage. No transaction has been submitted for verification. |
| Receive | Real local QR generation, distinct wallet-receive label, copyable full address. Payload contains only the wallet address; users must select Arc USDC in their sending wallet. |
| Activity | Real wallet-filtered USDC Transfer-event reads in bounded 2,000-block pages; send/receive filters, refresh, load older, stable chain/tx/log IDs, explicit RPC error and partial-history messages. Not a durable backend indexer. |
| Splits | Exact share calculator only, labelled as a preview. Payment-enabled named/open splits and shared links remain incomplete. |
| Shared purchases | Solidity source and tests exist. A gated on-chain interaction screen covers create, approval, contribute, release, cancel, expiry and claimable refunds. It needs a reviewed deployment address, real Arc testing, names/sharing, durable metadata and indexing before a complete product flow can be claimed. |
| Backend/auth | Privy is the single sign-in provider. The JWT-verified Node API, profile editing and single-use SIWE wallet verification are implemented. Owner created/configured Privy and Supabase and applied the migrations. All 12 tables and the challenge RPC are available. Live login/profile/wallet checks and SQL permission verification remain; see ACCOUNT-INTEGRATION.md. |
| Inbox/groups/settings | Existing scaffolds remain. Settings now contains profile editing, Privy wallet connection and active wallet selection. Group/inbox endpoints and advanced settings remain pending. |
| Legacy components | Unused testnet UI and mock-proxy hooks moved intact to `legacy/arc-testnet/`; they referenced removed contract exports and are not part of the active app. |

## Corrections to the original handoff

- The source is more substantial than an empty Studio starter, but existence of
  UI or a contract is not evidence of a tested, complete feature.
- Old testnet components, mainnet active screens, and template AGENTS.md settings
  conflicted. This continuation does not change the active mainnet configuration.
- The previous receive panel displayed text, not a QR. The previous Activity
  empty state was not backed by a history query.
- The existing purchase ID is `bytes32`, not a numeric ID. Database draft matches it.
- Current local contract results are recorded in `CONTRACT-READINESS.md`. Forge 1.7.1 is available through its official native Windows npm package. Exported caches are historical evidence only.
- The owner approved organizer release only after full funding, strictly before the release deadline. The contract enforces this boundary. Cancellation and expiry permit individual refund claims, not automatic transfers.
- `supabase.auth.setSession` must not be assumed to accept a Privy JWT. See setup
  guide for server-side verification and explicit database authorization.
- A server-side last-share check cannot atomically stop multiple direct token
  transfers. Final settlement/concurrency design remains open.

The exported Studio-only Compass deployment helper also depended on private
packages absent from this download. It and its helper were preserved unchanged
in `legacy/studio-tools/`; the broken local deployment command was removed.

## Next stages

1. Configure Privy/Supabase projects using `ACCOUNT-INTEGRATION.md`. Apply and test the migrations, real login/logout, origin redirects and database authorization. The account API and wallet ownership flow exist; live integration is not yet verified.
2. Add public username resolution and request storage on top of the implemented private profile API. Public pages must
   survive auth. Define single-use payment enforcement, production origin, QR
   links, expiry, confirmations and recovery before enabling sharing.
3. Implement named/open split settlement, invitations, organizer tracking,
   identity resolution, atomic share claims and chain-event reconciliation.
4. Complete independent contract review and actual USDC integration verification. Local unit/fuzz/invariant tests have passed; see `CONTRACT-READINESS.md`. Validate the gated create/detail/contribute/release/cancel/expire/refund UI against Arc
   against an explicitly configured reviewed deployment. No mainnet deployment
   or transaction is authorized by this document.
5. Finish groups, private inbox and notification/security/profile settings.
6. Add durable indexing/backfill with persisted cursors and timestamps, purchase
   event classification, retry services and reconciliation after metadata outages.
7. Complete live auth, real-wallet payment, cross-device QR, accessibility and
   failure recovery checks. Prepare deployment/submission evidence separately.

## Verification for this continuation

See `BUILD-VERIFICATION.md` for executed checks and limitations. Do not interpret
new code or unit tests as evidence of a live payment, deployed backend, or audit.
