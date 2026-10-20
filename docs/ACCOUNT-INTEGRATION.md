# JANUS account integration

## Current flow

The landing page has one Sign in entry. Privy presents email, Google and external wallet options in the same modal. On new email or Google sign-in, Privy creates an embedded EVM wallet for users without one. Existing signed-in users who have no wallet can choose Create JANUS wallet in Wallet or Settings. They can also connect an external wallet through Privy, select among connected wallets, verify ownership, and sign out. The header opens Settings. ConnectKit and its separate Connect wallet button are no longer in the active application.

The official @privy-io/wagmi adapter supplies the wallet used by wagmi payment hooks. Privy wraps TanStack Query, which wraps the Privy wagmi provider. Its wallet selector returns no wallet for a signed-out user and scopes a chosen wallet to the current Privy subject. Changing subject or wallet resets the application subtree so stale screens and modal state do not carry over. The embedded wallet initializes on Arc Mainnet, and the same EVM address can be used on other supported EVM networks. An email login completed before this change does not automatically create a wallet in the current session; the user can press Create JANUS wallet. If the public Privy App ID is absent, sign-in is unavailable.

Privy wallet connection is distinct from associating an address with a database profile. The latter still requires the user to sign a short, single-use SIWE ownership message in Settings. This signature is not a token approval or payment. The server never treats a browser-supplied address as proof of ownership.

## API and storage

The Node API verifies Privy ES256 access tokens using the trusted, app-specific Privy JWKS endpoint. It checks issuer, audience, subject, issue time and expiry.

| Endpoint | Authorization and behavior |
| --- | --- |
| GET /api/health | Process availability only; does not test upstream services. |
| GET /api/me | Returns the verified subject's profile and associated wallets. |
| PUT /api/profile | Creates or updates only the verified subject's profile. Username uniqueness is enforced by Postgres. |
| POST /api/wallet/challenge | Requires a saved profile; issues a five-minute SIWE message for Arc Mainnet. |
| POST /api/wallet/verify | Atomically consumes the subject-bound challenge and checks its signature before associating the wallet. |

Only the API holds the Supabase secret key. There is no browser Supabase client or anonymous database access. Caller-supplied user/profile IDs never select the acting account. Wallet addresses are unique and cannot be reassigned through an upsert. The server uses viem's public-client SIWE verifier on Arc, including contract-wallet verification where supported by that chain.

Requests have JSON/body limits, exact-origin mutation checks, no-store replies, upstream timeouts and per-process IP/subject rate limits. No token, signature or request body is logged. Pending browser API calls are cancelled or timed out; account changes stop stale token-dependent mutations. Studio request/console forwarding imports were removed from the active app. The previous testnet mock server is preserved in legacy/arc-testnet/server/index.ts and is not part of the account API.

## Local configuration

1. In the JANUS Privy app, enable email, Google and wallet login. The owner has enabled email and Google. A read-only local check confirmed that the real configured Privy modal displays all three choices. For production, add the exact hosted domain to Privy's allowed domains. Local development origins do not need a domain allowlist entry while the app is in development mode.
2. Put the public App ID in ignored .env.local as VITE_PRIVY_APP_ID. Put the same ID in ignored .env.server as PRIVY_APP_ID. Restart Vite after changing the browser variable.
3. The owner created a Supabase project and applied the setup SQL. Zero-row Data API reads returned HTTP 200 for all 12 tables; API metadata exposes the consume-wallet-challenge RPC. These checks do not establish the RLS/grants configuration. Run the read-only supabase/verify-janus.sql query in Supabase SQL Editor and review its expected results.
4. Set SUPABASE_URL, SUPABASE_SECRET_KEY and JANUS_ORIGIN=http://localhost:5173 in ignored .env.server. Keep the sb_secret_ key on the server. The API retrieves verification keys from Privy JWKS automatically; PRIVY_VERIFICATION_KEY may remain blank. The Privy app secret is not used by this backend.
5. Run npm run dev:api and npm run dev in separate terminals. Node 24 or a compatible version supporting --env-file-if-exists is required. Vite proxies /api to loopback port 3001. Use http://localhost:5173 in the browser.
6. Sign in with email or Google. A new walletless account should receive a Privy wallet automatically; an existing signed-in walletless account can press Create JANUS wallet. Save a profile and choose Verify connected wallet to associate the address with that profile. Check the ownership signature prompt. A live wallet creation, profile write and wallet association have not yet been completed in agent verification.

Missing server configuration stops the API and reports variable names only, never values. Unavailable backend responses appear as retryable errors rather than fabricated saved profiles.

## Hosting and operations

Serve /api through the same HTTPS origin as Vite's built files. Keep the API on loopback behind a reverse proxy, or set API_HOST explicitly in the host. Set JANUS_ORIGIN to the exact production origin without a path or trailing slash. Set ingress body/time limits and a distributed rate limiter before running multiple API instances; the supplied limiter is single-process and does not trust client-supplied forwarding headers. Schedule removal of expired wallet_challenges rows. Challenges are consumed on every verification attempt, so failed verification or RPC outages require a new challenge.

JOSE caches and refreshes JWKS signing keys. Token headers cannot supply a different key URL. A manual PEM override requires manual rotation. Token verification does not implement immediate server-side session revocation. Payment signing remains in the user's wallet.

## Verification and remaining work

On 19 October 2026, typecheck, type-aware lint, all 14 local tests, both browser suites and the production build passed with the unified flow. The account browser suite intercepts the Privy SDK and API only in its test harness; it runs the installed Privy wagmi adapter and verifies single entry, cancelled login, wallet connection and selection, profile save, signature rejection, subject isolation, delayed token races, sign-out and retry. The original browser suite still checks responsive landing, QR, payment review, activity and pending receipt recovery. The real configured Privy modal displayed email, Google and Wallet, with no uncaught page errors; no login was submitted in that check. The build warns about large dependency chunks. See BUILD-VERIFICATION.md.

The next owner-assisted check is to create the wallet in the existing signed-in session, then confirm its address and Arc Mainnet balance, save/reload the profile, and sign the ownership message. Supabase RLS/grants need the read-only SQL verification. Hosted access-control review, actual Arc contract-wallet verification, public requests, groups, inbox, indexing and purchase metadata remain pending. Passkey enrollment and advanced account recovery remain future features.

References:
- https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi
- https://docs.privy.io/authentication/user-authentication/login-methods/wallet
- https://docs.privy.io/authentication/user-authentication/access-tokens
- https://supabase.com/docs/guides/getting-started/api-keys
- https://docs.privy.io/basics/react/advanced/automatic-wallet-creation
- https://docs.privy.io/wallets/wallets/create/create-a-wallet
- https://docs.privy.io/basics/react/advanced/configuring-evm-networks
