# Build verification — 18 October 2026

## Passed

- Contracts: 115 unit/fuzz tests and four invariant tests passed locally with
  Forge 1.7.1 and mock USDC. Results span the full run and a unit/fuzz rerun
  after correcting one test error expectation. See `CONTRACT-READINESS.md`
  for commands, regression evidence, approved policy and remaining gates.

- TypeScript: `npm run typecheck` (`tsc --noEmit`).
- Type-aware lint: `npm run lint`, active `src/` and `scripts/`.
- Unit/security/QR tests: `npm test`, 14 tests passed on 19 October 2026. Covers exact USDC parsing,
  invalid/zero recipients, integer share rounding, event deduplication, bounded
  wallet-filtered pagination, RPC failures, pending payment recovery, matching
  receipt events and decoding the actual receive component's QR image.
- Production build: Vite completed successfully. It reports large chunks (main
  chunk approximately 1.45 MB uncompressed / 454 KB gzip) and third-party pure
  annotation warnings. Code splitting/dependency trimming remains a performance
  task; warning thresholds were not increased to hide it.
- Browser checks: mocked injected wallet and intercepted Arc RPC. Responsive
  landing at 320/375/768/1280px, supplied logo, wallet entry, receive QR decoding,
  native-dialog focus/Escape, split calculator, precision errors, rejected send,
  Activity RPC reads, account switch and logout. No uncaught page errors.
- Read-only real RPC: `https://rpc.mainnet.arc.io` answered `eth_chainId` with
  `0x13b2` (5042) and returned a latest block number. No wallet was used.

Screenshots and the browser result are in ignored `artifacts/verification/`.
The logo was visually inspected on the landing page; the receive dialog and QR
were also inspected. The image pixels come from the owner's actual attachment,
not a new SVG approximation. Favicon embeds that same raster in an SVG viewport.

## Account integration checks, 19 October 2026

TypeScript and type-aware lint passed for frontend, scripts and the new server.
`npm test` passed all 14 local tests, including invalid/expired JWT rejection,
cross-subject isolation, origin/body limits, real local EOA signatures, consumed
and expired challenges, simultaneous replay attempts, wallet ownership conflicts,
and Supabase-adapter request scoping/error handling. The adapter uses mocked HTTP;
these are not Postgres/RLS or hosted Privy integration results. An isolated startup check with all account credentials empty also confirmed the API exits without listening and reports variable names only.

Both browser suites passed. The account suite uses browser-only module
interception for the Privy SDK and mocks API replies; production has no auth
bypass. It covers profile save, rejected signing without submitting a proof,
verification, wallet/account changes, sign-out, backend outage/retry and mobile
overflow. A delayed token resolution across an account switch confirms that the
old draft is not submitted under the next subject. No uncaught page errors.

The production build passed after installing the declared `@stripe/stripe-js`
peer required by Privy's Stripe integration. The final rebuild also passed (2m 47s) and includes concise
wallet rejection messages. Build logs and browser results are retained in ignored
`artifacts/verification/`. SDK annotation and chunk-size warnings remain; the
main entry is approximately 1.47 MB (461 KB gzip), and the separate lazy Privy
session chunk is approximately 1.31 MB (365 KB gzip). No warnings are hidden and
no unresolved SDK modules are externalized or stubbed in production.

## Reproducing checks

Install the locked dependencies using Bun (`bun install --frozen-lockfile`).
Then run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
The scripts also work through Bun. `npm run check` runs these sequentially.
Dependencies were installed with lifecycle scripts disabled during this work;
Bun's lockfile was synchronized after dependency changes.

For browser checks start `npm run dev -- --host 127.0.0.1`, then run
`npm run test:browser` and `npm run test:browser:auth`. Install Playwright Chromium with
`npx playwright install chromium` if needed. An existing Chromium binary can be
selected with `PLAYWRIGHT_EXECUTABLE_PATH`; this verification used the already
installed headless Chromium revision 1234. The browser harness uses dummy
accounts, mocked receipt data and RPC interception. It rejects any attempted RPC
broadcast. Test confirmation messages are fixture results, not live payments.

## Limits

- No real wallet transaction, contract deployment, live payment, cross-device
  camera scan, email/Google/passkey login or hosted database integration tested.
- Contract tests use a local mock token. Actual Arc USDC integration and independent review remain outstanding; local passes are not an audit.
- The owner applied the Supabase setup SQL. All 12 tables and the challenge RPC are visible through zero-row reads/API metadata. RLS and grants have not been independently checked with supabase/verify-janus.sql.
- Frontend transfer history is bounded/paged, not a durable full-history indexer.
  Timestamp enrichment, username resolution and escrow-event classification
  remain outstanding.
- Archived testnet UI and Studio-only Compass tools are preserved unchanged in
  `legacy/`. The latter imported a private package absent from the export and
  are not a supported local deployment command. Active compilation excludes
  these archives by normal source-tree boundaries.
- Original baseline commit/tag are unchanged. No changes have been committed or
  pushed during this continuation. No secrets were printed or added to source.

## Privy JWKS setup verification

The backend now derives Privy's JWKS URL from the configured app ID and retrieves/cache-refreshes signing keys through JOSE. A manual PEM override is optional. Issuer, audience, ES256, expiry and subject checks remain enforced. The configured public endpoint returned HTTP 200 with two usable ES256 verification keys; no token or credential was sent in this read. This verifies key retrieval, not a completed live login. Types, lint and all 14 local tests passed, including mocked JWKS caching, key rotation, invalid signatures, wrong audience and upstream outage behavior. The owner later configured Supabase and applied the setup SQL; the hosted schema checkpoint below records the verified scope.

## Hosted schema and real login UI checkpoint

On 19 October 2026, the owner completed the setup query. Zero-row Data API reads returned 200 for all 12 tables, and the wallet-challenge RPC appeared in API metadata. These checks did not select user records or independently inspect RLS/grants. The local API returned 200 through Vite for /api/health and 401 for an unauthenticated /api/me request. An isolated browser opened the real configured Privy UI at localhost:5173: the email field and Google option were present, with no uncaught page errors. Screenshot and sanitized reports are in ignored artifacts/verification. No email was submitted, authenticated session obtained, signature made or database record written in that UI check. The user's end-to-end login/profile test is next.

## Unified Privy account flow, 19 October 2026

ConnectKit was removed from the active dependency set and UI. The landing Sign in entry opens one Privy modal for email, Google and external wallet login. The official @privy-io/wagmi adapter supplies the wallet for the payment hooks. Settings contains profile editing, wallet connection, active wallet selection, ownership verification and sign-out. Embedded wallet creation stays disabled.

After this change, npm run check completed successfully: typecheck, type-aware lint, all 14 tests and a production build. The build took 2m 39s and retained the large-chunk warning; the lazy Privy session chunk is approximately 1.35 MB uncompressed / 376 KB gzip. No warning threshold was raised.

Both browser suites passed with browser-only Privy and API fixtures. The account suite exercised the installed Privy wagmi adapter and covered cancelled login, email/Google entry, profile save, wallet connection and selection, rejected proof signature, subject isolation, delayed-token race, sign-out and backend retry. The payment suite still covered responsive layout, QR, send review and rejection, pending receipt recovery and activity. No browser page errors were reported.

A separate read-only check opened the actual configured Privy modal at localhost:5173. Email, Google and Wallet choices were visible; the old separate account card was absent and no page errors were reported. No email was sent, authenticated login completed, wallet signature requested, transaction submitted or database record written. A real user login/profile persistence and Supabase RLS/grant check remain outstanding. Sanitized reports and screenshots are in ignored artifacts/verification/.
## Shared-purchase screen checkpoint, 19 October 2026

The Purchase placeholder was replaced with a gated on-chain interaction screen. Without VITE_JANUS_PURCHASE_ADDRESS, it remains read-only and cannot collect funds. With a reviewed address, the implementation supports create/load by bytes32 ID, exact USDC approval, contribution, organizer release/cancellation, eligible expiry, and contributor refund claims. Each transaction is simulated before wallet submission; submitted hashes are recoverable by wallet in session storage. Purchase names, share links, notifications and durable indexing remain outstanding.

Typecheck and type-aware lint passed after the purchase changes. The local test suite passed 18 tests, including new deadline, recipient and refund-rule cases. The existing browser regression passed with the contract unconfigured; no RPC broadcast occurred. A local ABI encode/decode check confirmed that viem returns uint40 deadlines as numbers. Neither browser suite has yet exercised real Arc contract calls or receipts for this screen. The final production build passed in 3m 8s after the last functional edit. It retained the large-chunk warning; the full log is saved in ignored artifacts/verification/purchase-final-build.log.
## Privy embedded wallet flow, 19 October 2026

The previous release disabled wallet creation, which caused an email-authenticated user to see a Connect wallet prompt. JANUS now requests automatic Privy EVM wallet creation for a new user with no wallet. The existing signed-in walletless state offers Create JANUS wallet and Connect existing wallet. Arc Mainnet is the default chain; this is an EVM wallet usable on Arc, not a chain-specific account. Wallet ownership association with the profile still requires a separate signature. No mainnet transaction was submitted.
