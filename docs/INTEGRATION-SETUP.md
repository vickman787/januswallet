# JANUS integration setup

The application supports injected external wallets and now includes optional Privy email/Google login, a profile API, and signed wallet association. Follow `ACCOUNT-INTEGRATION.md` for the implemented setup. Passkeys, public requests, groups and inbox remain pending.
Privy and Supabase projects were created and configured by the owner on 19 October 2026. See ACCOUNT-INTEGRATION.md for the latest verified checkpoint.

## Local setup

Install Bun, then run `bun install --frozen-lockfile`, `bun run typecheck`,
`bun run build`, and `bun run dev`. Dependencies and build output stay ignored.
Keep the existing `.env` private. The public variables in `.env.example` are
configuration slots, not working credentials. Never paste a private key into
frontend configuration. No contract deployment is part of this setup.

## Privy

1. Create an application in Privy's dashboard. Enable email, Google and external
   wallet login. Register exact local and production origins/redirects.
2. Record only its public app ID in `VITE_PRIVY_APP_ID`; keep any application
   secret server-side. Set up Google credentials through the provider dashboard.
3. Before enabling embedded payments, test Arc Mainnet (chain 5042) with a
   configured EVM chain and current Privy wallet APIs. A custom-chain setting is
   not proof that embedded-wallet funding, fees, signing and logout work.
4. Add a single auth provider and header account control; avoid running unrelated
   ConnectKit and Privy sessions without a documented wallet association.
5. Have the server verify the Privy access token signature, issuer, audience and
   expiry using Privy's current Node SDK/JWKS. The subject identifies the user;
   it does not prove ownership of an arbitrary client-supplied wallet address.
6. Verify each wallet association using a server-issued, single-use, expiring,
   origin-bound SIWE challenge. Validate chain, address and signature (including
   smart contract wallets where supported). Never trust a posted `userId`.
7. Offer passkey registration only to an authenticated user. Test registration,
   returning login, cancellation, unsupported devices and missing credentials.

Current reference: https://docs.privy.io/authentication/user-authentication/access-tokens

## Supabase and authorization

1. Create a project and select its region. Keep its database password and service
   role key out of source control and browser bundles.
2. Review `supabase/migrations/202610180001_foundation.sql` before applying it.
   This is an unexecuted foundation with RLS and no client policies/grants. It
   deliberately does not turn on public database access.
3. Recommended initial integration: browser -> JANUS API -> Supabase. The API
   verifies the Privy access token and wallet challenge, enforces ownership and
   membership, validates all input, and uses a server-only database credential.
   The service role bypasses RLS: every endpoint needs explicit authorization.
4. Do not call Supabase `auth.setSession` with a Privy token and assume it works.
   Direct browser access would require an explicitly configured, supported JWT
   trust integration and tested RLS. Privy subjects are not UUID Supabase user IDs.
5. Public `/pay/:id` and `/split/:id` endpoints must return only public payment
   terms. Private inbox/group data must require verified membership.
6. Add atomic database operations for username uniqueness, invitations and
   single-use requests. A database paid flag alone cannot prevent two direct
   transfers: single-use payment enforcement needs a contract or another
   explicitly designed settlement mechanism. Do not promise it before that exists.
7. Index receipts/events using `(chain_id, tx_hash, log_index)`. Verify chain,
   token, recipient, amount, receipt success and any contract event before marking
   payment confirmed. Retrying metadata writes must never resubmit a transfer.
8. An indexer must have a deployment/start block, persisted cursor, overlap for
   recovery, bounded RPC reads, idempotency and operational retries. The current
   frontend transfer history is a bounded reader, not a durable indexer.

Supabase references:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/third-party/custom-oidc

## Hosting and verification gates

Host static Vite assets and a server runtime separately, or behind one origin.
Configure a production HTTPS origin, same-origin API/reverse proxy, exact CORS
allowlist, rate limits, request body limits, and secret storage. Do not expose
server credentials through `VITE_` variables. No localhost sharing links.

Acceptance before claiming integration: expired/wrong-audience tokens rejected;
wallet replay rejected; other users' edits/inbox/group reads denied; account
switch clears data; logout reaches landing; public payment pages survive login;
confirmed receipt survives metadata outage; duplicated receipt indexing creates
one event; simultaneous final-share attempts cannot overfund. Provisioning and
these integration checks remain outstanding.

## Network evidence

The exported active app uses Arc Mainnet. Current Arc connection documentation
lists chain 5042, https://rpc.mainnet.arc.io and https://explorer.arc.io:
https://docs.arc.io/arc/references/connect-to-arc

Never copy the older Arc Testnet settings from the template AGENTS.md into a
mainnet flow. Native gas USDC uses 18 decimals; the ERC-20 interface uses 6.
No on-chain transaction was submitted during this continuation.
