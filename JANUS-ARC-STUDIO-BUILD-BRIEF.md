# JANUS — Arc Studio Product and Build Brief

> Use this document as the persistent product specification for a new JANUS implementation built in Arc Studio. Upload the two supplied logo reference images alongside this file. Build incrementally and report what is implemented, verified, or still incomplete.

## 1. Product

**Name:** JANUS  
**Tagline:** Shared payments. Safe settlement.  
**Target network:** Arc mainnet  
**Payment asset:** USDC  
**Build environment:** Arc Studio

JANUS helps people send money, request payments, split bills, and fund shared purchases. Retain the existing JANUS product capabilities while rebuilding the app and contracts through Arc Studio for Arc and USDC.

The distinctive addition is refundable shared purchases: contributors fund a purchase through a contract, with clear release, cancellation, expiry, and refund rules.

This brief is a target specification, not evidence that integrations or features already work. Verify Arc Studio capabilities and current network configuration before implementation. Do not modify or deploy the existing Monad JANUS application as part of this build.

## 2. Branding and supplied logo assets

Keep the JANUS name and the supplied silver-and-cobalt opposing-face symbol. Use the dark background from the references throughout the application.

Upload these original attachments to the Studio project:

1. **Primary logo reference:** `codex-clipboard-635d0733-6c49-4bc8-92e3-b11a999ec0c8.png` — silver/cobalt symbol, JANUS wordmark, black background.
2. **Brand board:** `codex-clipboard-88fa9d01-aa53-484d-a220-7326bbf13993.png` — primary and monochrome logos, app icon, palette, and usage references.

The image binaries are not embedded in this Markdown file. A local Windows path is not an uploaded Studio asset. Attach the actual images to Studio with this brief. These are reference screenshots; obtain or prepare clean individual production assets rather than displaying the whole brand board as a logo.

### Logo usage

- Header: compact symbol and JANUS wordmark.
- Landing page: larger symbol/wordmark lockup with the new payments tagline.
- Favicon and app icon: symbol only, legible at small sizes.
- Loading and empty states: use the symbol sparingly.
- Preserve proportions and clear space; do not stretch or invent a different symbol.
- Prefer SVG for production logo/symbol assets and PNG for raster app icons.
- If a faithful clean asset is unavailable, identify that limitation rather than silently substituting a new design.

### Replace the old reference wording

Use **“Shared payments. Safe settlement.”** The separately supplied screenshot containing that sentence is a tagline reference, not another logo.

Do not carry these phrases from the artwork into this payments product:

- Restart-safe onchain execution agent
- Remembers. Verifies. Continues.
- Same context. Further progress.
- Past state. Verified. Next action.

### Palette

| Role | Colour | Intended use |
| --- | --- | --- |
| Midnight | `#0B0D12` | Main background |
| Cold ivory | `#F1F3F2` | Primary text |
| Electric cobalt | `#4D6BFF` | Brand accents and primary actions |
| Steel | `#77808F` | Secondary text and supporting elements |

These values follow the supplied brand board. Match the near-black visual character of the primary logo reference. Adjust text colours as necessary for accessible contrast. Use green for success, amber for actionable warnings, and red for errors or destructive actions.

## 3. Design direction

Create a restrained payments interface with clear hierarchy, comfortable typography, subtle surfaces, thin dividers, and intentional cobalt accents.

- Avoid excessive gradients, glows, decorative panels, and oversized rounded cards.
- Avoid excessive uppercase labels and huge call-to-action text.
- Do not repeat information or authentication controls unnecessarily.
- Give amounts, recipient identity, and payment status visual priority.
- Keep transaction links separated from adjacent buttons.
- Use one external-link indicator per transaction link.
- Use simple person icons for participant avatars rather than literal `Y` or `@` placeholders.
- Retain `@username` in participant names; replacing an avatar does not remove the username prefix.
- Display “You” and organizer status without redundant organizer labels.
- Support accessible focus states, keyboard navigation, reduced motion, readable contrast, and clear form errors.

## 4. Screens and navigation

Primary sections:

- Wallet
- Activity
- Inbox
- Groups
- Settings

Use a floating bottom navigation bar with clear active states. Respect safe areas and leave enough content padding so it never obscures content. Handle browser toolbars, keyboard opening, narrow screens, and browser zoom.

Landing page:

- JANUS logo and new tagline.
- Clear explanation of sending, splitting, and refundable shared purchases.
- Open wallet/sign-in action.
- Readable product previews.
- Simple explanation of how the app works.

Make phone previews physically larger through their layout dimensions when needed. Do not simulate larger previews by zooming their contents. Do not disable browser zoom. Desktop-site mode in a mobile browser should not be mistaken for the normal mobile layout.

## 5. Authentication and account controls

Desired methods: email, Google, external wallet, and optionally passkey. Privy is preferred, subject to verifying Studio integration and Arc support.

- Keep email, Google, and wallet alternatives available.
- A passkey must be registered before it can be used for returning sign-in.
- Offer passkey registration to an eligible authenticated user with a clear explanation.
- Handle unsupported devices, missing credentials, rejected prompts, and cancelled registration.
- Do not claim first-time passkey onboarding unless that exact flow is implemented and tested.
- Use one primary authentication/account control in the shared header.
- Avoid duplicate connect/disconnect controls in balance and recent-activity sections.
- Explain signed-out content without adding another competing sign-in button.
- After explicit logout/disconnect, clear the appropriate session and navigate to the landing page. Verify both embedded-wallet and external-wallet paths.
- Do not redirect public payment pages merely because the visitor is signed out.
- Handle session expiry and account switching without exposing stale account data.

Authentication does not prove ownership of an unrelated wallet address. Verify wallet associations used for protected actions.

## 6. Profiles and usernames

Support unique usernames and verified wallet associations. Normalize addresses for lookups and enforce username validation and uniqueness.

Resolve usernames consistently in:

- Named-split participants.
- Open-split “Paid by” contributor lists.
- Activity counterparties.
- Payment requester and recipient details.
- Groups and purchase contributions.

Fallback to a shortened address when no profile exists. Keep the full address accessible in payment review/details. Usernames are presentation identities; funds go to the verified wallet address.

Prevent unauthorized profile edits and stale identity data after switching accounts. Do not assume public profile access also authorizes access to private inbox or group records.

## 7. Wallet and balance

Show account identity, available USDC balance, network, Send, Request, Split, Shared purchase, and recent activity.

- Distinguish loading, unavailable balance, and an actual zero balance.
- Refresh after confirmed transactions and on returning to the app.
- Format amounts accurately using token precision.
- Do not label a mainnet account “Testnet.”
- Do not include the old 10,000 test-AUSD claim/faucet row in mainnet UI.
- Development funding tools must be restricted to the matching test environment.

## 8. Send and receive USDC

### Send

Inputs: username/address, amount, optional note.

Review: recipient identity and full address, amount, asset, network, and relevant transaction cost information.

Handle invalid recipient, insufficient balance, wrong network, approval requirements, rejected prompts, pending confirmation, failure, and confirmed success. Do not record rejected transactions as successful.

After confirmation, update balance/activity and show one “View transaction” link plus a separate Done button with comfortable spacing. Done closes the completed flow without resubmitting payment.

### Receive

Provide copyable address and receive QR with clear Arc/USDC instructions. Label wallet-receive QR codes separately from payment-request QR codes. Verify the decoded payload matches the intended destination.

## 9. Payment requests and public links

Support amount, optional description, requester identity, recipient address, public URL, QR, status, and explorer link after payment.

States: unpaid, pending confirmation, paid, and cancelled/expired where implemented.

- Prevent accidental duplicate payment for single-use requests.
- Resolve requester and recipient usernames where available.
- Public pages remain useful before login.
- Preserve the intended payment destination through authentication.
- Use the deployed app origin or an explicitly configured public origin.
- Never publish localhost payment links or QR payloads.
- Test opening links and scanning QR codes on another device.
- Disable or explain sharing when the request has not yet been created successfully.

## 10. Named and open bill splits

Named splits select participants by username or address. Open splits specify a total and number of available shares, payable through a public link.

Show title, total USDC amount, amount per share, participants/shares, organizer, funded progress, contributor identities, status, and relevant transactions.

- Track actual confirmed payments and organizer contributions accurately.
- Prevent overfunding and unintended duplicate share payments.
- Define exact integer rounding; shares must sum to the total.
- Handle simultaneous attempts to fund the last available share.
- Display open-split contributors using usernames when profiles exist.
- A “Settled” label must correspond to the actual settlement rule.
- Keep ordinary direct-settlement bill splits distinct from escrow purchases.
- Explain whether payment goes directly to the organizer or remains refundable in escrow before approval.

## 11. Refundable shared purchases

Contributions remain in a contract until released or refunded under disclosed conditions. A transfer already paid directly to an organizer cannot be automatically recovered by adding a cancellation button.

### Creation

Specify title, description, target amount, contribution structure, funding deadline, recipient, release policy, and cancellation policy. Show these terms before contribution and prevent unilateral changes to material terms after funding begins unless a safe, explicitly agreed mechanism exists.

### State model

`Funding → Funded → Released`

Eligible unreleased purchases can instead become `Cancelled` or `Expired`. Track each contributor's refund entitlement and completed refunds separately. Reaching the target does not itself mean funds were released.

### Contribution

- Record the amount actually contributed by each wallet.
- Enforce target and per-share limits.
- Reject contributions after cancellation, expiry, or release.
- Keep funds and accounting isolated between purchases.
- Emit events for indexing and recovery.

### Release policy — proposed default, not a settled requirement

Initial recommendation: organizer may release only after full funding, subject to the disclosed deadline/cancellation rules. Clearly tell contributors that the organizer controls release. This does not protect against an organizer releasing funds and failing to make the purchase.

Participant-approved release is an alternative requiring additional product decisions and contract logic. Confirm the policy before final contract implementation. Once released, escrow refunds are unavailable.

### Cancellation and expiry

- Permit cancellation only under the chosen disclosed policy.
- Cancellation prevents further contributions and release.
- Preserve exact contributor refund entitlements.
- Do not redirect refunds to an arbitrary address chosen by the organizer.
- Underfunded purchases should support recovery after their deadline.
- Specify funded-purchase deadlines too, so funds cannot remain locked indefinitely.
- Resolve competing release/cancellation attempts atomically in the contract.

### What “automatic refund” means

The desired feature is returning contributions when an eligible purchase is cancelled. Choose and implement the actual mechanism; do not mislabel it.

1. **Claimable refund:** cancellation makes funds available; each contributor submits a refund transaction.
2. **Refund during cancellation:** the cancellation transaction returns contributions, practical only with bounded participant counts and a design that handles transfer failures.
3. **Background refunds:** an explicitly implemented and funded service submits refund transactions after cancellation, with retries and user recovery.

Contracts do not wake up and send money simply because a deadline passes. Someone or a service must submit a transaction.

Recommended implementation to evaluate: individual refund claims as a dependable recovery path, plus bounded automatic/batch refunds or an automation service if verified feasible. If automation is incomplete, display “Refund available” rather than “Refund sent.”

- Prevent double refunds.
- A failed refund must not permanently block other contributors.
- Track available, processing, completed, and failed refunds honestly.
- Retry services must be idempotent and cannot invent successful transfers.
- Identify who pays transaction costs and what happens if the service is unavailable.

## 12. Groups

Support creating/naming groups, adding participants, viewing membership, creating related splits/purchases, and viewing requests/activity. Enforce membership and editing permissions. Reuse the verified payment flows rather than duplicating financial logic.

## 13. Inbox

Include payment requests, split invitations, group invitations, purchase updates, and refund notifications. Link each item to actionable details. Include loading, empty, error, and signed-out states. Protect private records from unrelated accounts.

## 14. Activity, indexing, and recovery

Cover sends/receives, requests, split payments, purchase contributions, release, cancellation, and refunds. Display description, username/address, amount, status, timestamp, and correct explorer link.

- Treat confirmed chain state as authoritative for contract payments.
- Update promptly after confirmation, refresh on app return, and provide manual refresh.
- Use receipts/events for reconciliation and backfill.
- Do not rely only on existing database activity to recover transactions never saved there.
- Avoid duplicate records through stable transaction/event identifiers.
- Handle interrupted writes, temporary outages, and delayed indexing.
- Do not present a confirmed payment as failed because metadata storage failed.
- Show actionable synchronization messages with useful retry behaviour.
- A retry must explain a real error or recover missing data, not loop indefinitely.
- Do not assume older transactions are absent simply because integration was incomplete; verify chain events and database records.

## 15. Backend and authorization

Supabase is preferred for profiles, wallet associations, group membership, request/split/purchase metadata, notifications, and indexed activity, subject to Studio integration verification.

- Define how Privy authentication authorizes backend/database operations.
- Apply row-level policies and server-side checks as appropriate.
- Verify ownership for protected mutations.
- Keep privileged keys out of browser code.
- Separate public payment metadata from private account information.
- Validate client inputs and transaction receipts.
- Make indexing and history writes idempotent.
- Preserve chain truth when database metadata disagrees.

## 16. Contract and network implementation

Use verified current Arc network settings, official USDC address, token precision, RPC, and explorer configuration. Do not guess values or reuse Monad/AUSD settings.

Use established libraries where appropriate. Address access control, safe token transfers, reentrancy, precise accounting, rounding, duplicate payments/refunds, state transitions, and event coverage.

Do not add unrestricted administrator withdrawal of participant funds. Document any privileged controls, upgradeability, pause authority, and their effect on refunds. Prefer a minimal contract surface and clear recovery paths.

Test before mainnet and use small amounts for the demonstration. Do not claim generated code is audited.

## 17. Arc Studio workflow and verification gaps

Use Studio for contract writing/editing, tests, review iterations, application building, integration, previews, and debugging. Preserve the Studio project URL and useful build history.

Before depending on them, verify Studio support for:

- Privy and its Arc-compatible wallet flow.
- Supabase authentication/authorization integration.
- Uploaded logo assets and production asset handling.
- Environment secrets and server-side code.
- Background indexing/refund automation.
- GitHub connection/export.
- Hosting and public app URLs.
- Mainnet deployment and transaction signing workflow.

These have not all been tested for this project. Studio's general capabilities do not prove every integration will work unchanged. Identify limitations and propose concrete alternatives without silently dropping requested features.

## 18. Implementation stages

1. Verify platform capabilities, propose architecture, and resolve escrow/release/refund policies.
2. Establish branding, landing page, responsive app shell, navigation, and reusable components.
3. Implement authentication, wallet identity, profiles, usernames, balance, and logout behaviour.
4. Implement send/receive, requests, public links, QR codes, and activity foundations.
5. Implement named/open splits and confirmed payment indexing.
6. Implement and test escrow purchases, release, cancellation, expiry, and refunds.
7. Complete groups, inbox, settings, reconciliation, and error recovery.
8. Verify complete flows, prepare mainnet deployment, and collect submission evidence.

The full feature set is the target. Track incomplete work explicitly. Do not replace required live functionality with mock data and call it complete.

## 19. Acceptance checks

### Identity and accounts

- Supported login methods work; passkey registration and sign-in are distinguished.
- All relevant lists resolve known usernames consistently.
- Account switching clears stale data.
- Logout reaches the landing page after session clearing.
- Public payment pages work for signed-out visitors.
- Authentication controls are not duplicated unnecessarily.

### Payments and links

- Amount, recipient, network, and token are correct.
- Rejections/failures never appear as successful payments.
- Confirmed payments update balance and history promptly.
- QR payloads decode to the exact public destination and work on another device.
- No production sharing URL contains localhost.
- Explorer links use the correct chain and transaction.
- One external-link indicator is spaced comfortably from Done.

### Splits and purchases

- Share arithmetic totals exactly, including rounding.
- Last-share concurrency does not overfund.
- Named/open contributors show the correct identities.
- Direct settlement and escrow are clearly distinguished.
- Release obeys the disclosed policy.
- Cancellation blocks release and future contributions.
- Refunds match actual contributions and cannot execute twice.
- Expiry and automation failure still have a usable recovery path.
- One participant's failed refund does not lock everyone else's funds.
- Released funds cannot also be refunded.

### Backend and interface

- Unauthorized reads/writes are rejected.
- No privileged secrets are shipped to the client.
- Missing history can be reconstructed from receipts/events.
- Repeated indexing does not create duplicates.
- Floating navigation does not hide content or form actions.
- Header fits narrow screens and browser zoom remains usable.
- Loading, zero, empty, and error states are distinct.

## 20. Hackathon evidence and submission

Previously reviewed competition: https://dorahacks.io/hackathon/arc-microgrants-2/detail  
Arc Studio: https://studio.arc.io/

The reviewed requirements included a project built through Arc Studio, contracts written/tested there, a working public app, Arc mainnet deployment, and a real USDC transaction through the app and contract.

Prepare:

- Arc Studio project URL.
- Public live app URL.
- Public repository.
- Mainnet contract addresses.
- Example USDC transaction hash and explorer link.
- Walkthrough demonstrating Studio usage and the working payment flow.
- Short description of the product and how Studio was used.
- Public builder profile.

Recheck current rules, eligibility, deadlines, and demo limits before submission. Do not treat this brief as a substitute for the official competition page. Be transparent about reused references/code and completed features.

## 21. First message to paste into Arc Studio

Build JANUS using the attached Markdown specification and two logo references as the persistent product brief.

JANUS is a consumer USDC payments app targeting Arc mainnet. Its tagline is “Shared payments. Safe settlement.” Preserve the supplied silver-and-cobalt symbol and JANUS wordmark. Use the supplied dark background, midnight #0B0D12, ivory #F1F3F2, cobalt #4D6BFF, and steel #77808F with accessible contrast. Replace the execution-agent slogans in the reference artwork with the payments tagline.

The complete scope includes wallet access, email/Google/external-wallet login, optional passkeys, usernames, USDC send/receive, named/open splits, public payment requests, QR codes, groups, inbox, settings, accurate activity, and refundable shared purchases.

First inspect the environment's capabilities and propose the architecture, contracts, data model, authorization model, hosting approach, and build sequence. Verify Privy, Supabase, secrets, asset uploads, background jobs, and mainnet deployment support before depending on them. Identify unresolved release/cancellation/refund policy decisions before implementing escrow contracts.

Then begin with branding and the responsive application shell. Build incrementally through the stages in the brief. Keep an implementation checklist and report real integration status. Use tests for financial logic and end-to-end checks for completed payment flows. Do not present mock functionality as complete.

## 22. Follow-up prompts for staged work

### Identity and wallet

Implement the identity and wallet stage from the brief. Verify the chosen authentication/backend authorization integration, username ownership, accurate balance states, single account control, account switching, and logout navigation. Keep passkey registration separate from returning sign-in.

### Payments and splits

Implement real USDC send/receive, payment requests, QR codes, named splits, and open splits. Verify token/network configuration, precise arithmetic, last-share concurrency, public-domain sharing links, usernames, explorer links, and immediate confirmed-history updates with reconciliation.

### Refundable purchases

Before coding, restate the agreed release, cancellation, funded/underfunded deadline, and refund policies. Implement escrow accounting and tests for competing state changes, authorization, overfunding, duplicate refunds, failed transfers, and recovery. Clearly distinguish refunds available to claim from refunds actually sent. Verify any automation service rather than assuming contracts execute themselves.

### Final review

Review the entire app against the acceptance checks. Exercise real completed flows and report evidence, incomplete features, known limitations, and deployment prerequisites. Check mobile layouts, floating navigation, QR decoding, public URLs, auth duplication, identity resolution, history recovery, and refund behaviour. Prepare the Studio project link, repository, deployment addresses, transaction evidence, and demo outline.
