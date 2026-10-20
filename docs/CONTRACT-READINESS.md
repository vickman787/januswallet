# JANUS contract readiness

Stage 1, 18 October 2026. This is local implementation/test evidence, not an
independent audit, deployment authorization, or proof of live USDC integration.

## Existing contracts

| Contract | Purpose | Product fit |
| --- | --- | --- |
| `JanusPurchase.sol` | Refundable shared-purchase escrow | Intended shared-purchase contract. A gated on-chain purchase UI is present. Arc Testnet deployment is registered; Arc Mainnet remains unconfigured. |
| `JanusSplitter.sol` | Named participants pay shares into a contract, followed by settlement or refunds | Older escrow splitter, not the specified direct-to-organizer ordinary split flow. Retained and tested, not wired into the active app. |

The splitter supports at most 20 named participants and does not implement open
share claims. After a partial funding deadline, its creator can settle partial
funds, while permissionless finalization can instead make them refundable. Do
not reuse it as ordinary direct settlement or as the new purchase contract.
That product/settlement distinction must be resolved before split integration.

## Release decision approved by the owner

The organizer may release only after full funding and strictly before the
release deadline. Contributor voting is not the chosen release model.
Organizer control does not guarantee the organizer completes the off-chain
purchase after release. Once released, escrow refunds are unavailable.

Other behavior already present in the contract, to disclose before contributions:

- The organizer may cancel a Funding or Funded purchase before release.
- Funding closes at the funding deadline. An underfunded purchase can then be
  marked expired by anyone. A funded purchase can be marked expired at its
  release deadline. A transaction is required to mark expiry.
- Cancellation or marked expiry makes each contributor's exact contribution
  claimable by that wallet. Refunds are not sent automatically.
- Terms/deadlines are fixed at creation. The first valid mined state transition
  resolves competing release/cancellation/expiry attempts.
- No global administrator withdrawal or upgrade mechanism exists in JanusPurchase.

## Defects confirmed and repaired

1. Both contracts allowed themselves as payout recipient. Settlement/release to
   the same contract can leave funds inside while closing refund eligibility.
   Creation now rejects that destination, reusing `InvalidRecipient`.
2. Purchase release was allowed exactly at `releaseDeadline`, contrary to the
   approved strictly-before rule. Release now rejects `timestamp >= deadline`.
3. Funding closed at its deadline, while marking expiry still rejected the same
   timestamp. Expiry is now available at the applicable deadline, with no gap
   between the valid release/funding window and expiry eligibility.
4. The exported shared token mock lacked `setFailTransfers`, although the splitter
   tests called it. That prevented compilation of the Solidity suite. The test-only
   mock now provides a false-return failure mode without changing production tokens.

Five new regression tests were run before the production changes. All five
failed against the original behavior. The before-fix log is retained locally in
`artifacts/verification/contracts-regression-before.log`.

Additional tests cover refund failure/retry, other contributors' recovery,
failed release followed by cancellation/refund, and cancellation preventing
release/new contributions. No frontend ABI signature changed in these fixes.

## Test environment

- Official Foundry native Windows Forge 1.7.1, matching `.foundry-version`.
- Solidity 0.8.28, optimizer 200, Paris EVM from existing foundry.toml.
- Local EVM with mock USDC; no RPC fork, wallet key or broadcast used.
- Full suite command: `forge test --summary --fuzz-seed 0x4a414e5553`.
- Results: 58 purchase and 57 splitter unit/fuzz tests pass. Seven fuzz tests
  each ran 256 cases. All four invariant tests pass, each with 256 runs and
  128,000 handler calls.
- The full run in `artifacts/verification/contracts-test.log` finished with four
  passing invariants and one unit assertion mismatch: the test expected only
  the error selector, while the contract correctly returned the error plus ID.
  Only that assertion was corrected afterward; production and invariant code
  stayed unchanged. The final unit/fuzz rerun passed all 115 tests, recorded in
  `artifacts/verification/contracts-unit-final.log`.
- Final rerun command: `forge test --summary --no-match-contract .*InvariantTest
  --fuzz-seed 0x4a414e5553`. Combined evidence covers 119 passing tests; this is
  not a claim of a second complete suite run after the assertion correction.

Forge was obtained using the official `@foundry-rs/forge-win32-amd64@1.7.1` npm
package. Existing `contracts:test` and `contracts:build` scripts work when Forge
is on PATH. The native Windows package can also run through
`npm exec --yes --package=@foundry-rs/forge-win32-amd64@1.7.1 -- forge test`.

## Still required before deployment or collecting funds

- Independent contract review, including USDC blacklist/failure behavior.
- Read-only/fork integration verification against the intended Arc network and
  official USDC contract, code, decimals and receipt/events.
- Review all cancellation/expiry disclosures and final UI terms with the owner.
- Complete purchase names/sharing, durable metadata, event indexing and
  metadata recovery. Store production contract address and deployment block only
  after an explicitly authorized deployment.
- Test user rejection, wrong network, transfer failures, refund retries and
  metadata/indexer outages through the application.
- Re-run tests after any contract or dependency change. Passing local tests is
  not an audit and does not establish that all product requirements are complete.

At the 19 October checkpoint, no contracts had been deployed, no on-chain transactions had been submitted, and no Git
commit/push was made, and the original baseline tag remains unchanged.

## Purchase UI checkpoint, 19 October 2026

The wallet Purchase entry now has an on-chain testing interface for creating and loading a purchase by bytes32 ID, exact USDC approval, contribution, organizer release/cancellation, permissionless expiry, and individual refund claims. It displays full addresses, fixed deadlines, balances, contribution/claim state and transaction explorer links. Submitted hashes are held per wallet in browser session storage for confirmation recovery. The Mainnet mode remains inactive until VITE_JANUS_PURCHASE_ADDRESS is set to a reviewed Mainnet deployment. At this checkpoint, no contract address was configured and no transaction was sent.

This is a contract interaction surface, not the complete named/shared-purchase product. Public links, names, private metadata, notifications, durable indexing and reconciliation remain to be implemented. Browser tests have only exercised the inactive gate; live contract calls and receipt paths have not been exercised against Arc.

## Arc Testnet deployment, 20 October 2026

JanusPurchase was deployed through the local Privy-signed development tool to Arc Testnet:

- Contract: `0xbcae6c22c0c3c2509f920613a4900065bfe00442`
- Chain ID: `5042002`
- Canonical USDC interface: `0x3600000000000000000000000000000000000000`
- USDC decimals: `6`
- Runtime bytecode returned by the RPC: `4,031` bytes

The deployment page confirmed the receipt and read `ARC_USDC()` from the deployed contract. An independent read-only preflight then confirmed the chain ID, deployed code, canonical USDC address and decimals. This confirms deployment configuration; it is not source-code verification or an audit.

A development-only purchase validation route uses this address on Arc Testnet. Its pending transaction state is keyed by chain so a Testnet action cannot be mistaken for a Mainnet pending action. The normal wallet Purchase button remains in Mainnet mode and stays inactive until a Mainnet address is configured.

The Arc Mainnet deployment completed on 20 October 2026. See the verified deployment record below.

### Manual cancellation and refund validation

- Purchase ID: `0xdffbbc6c933ce8bae100af75de7a2e18fcb1afdd5ed3975802bda018f3105bff`
- Organizer and recipient: `0xced5912f985883a0c45aa62f11d294beaa36d026`
- Target and funded amount: `0.1 USDC`
- Current on-chain status: `Cancelled` (`3`)
- Canonical USDC: `0x3600000000000000000000000000000000000000`
- Contributor wallet: `0x52b1185eF92a3281b42c9355F4b419b348b9eb68`
- Contributor amount: `0.1 USDC`
- Refund claimed on-chain: `true`

The purchase fields, Cancelled status, Wallet B contribution and refund-claimed flag were independently read from the Arc Testnet RPC on 20 October 2026. This verifies the completed cancellation and individual refund path at current state.

### Manual full-funding and release validation

- Purchase ID: `0x017f435211f65d94f2d40ace536a8d37f0af6108613678665ce82afb0f0982b4`
- Organizer: `0xced5912f985883a0c45aa62f11d294beaa36d026`
- Recipient: `0x52b1185eF92a3281b42c9355F4b419b348b9eb68`
- Target and funded amount: `0.2 USDC`
- Current on-chain status: `Released` (`2`)
- Canonical USDC: `0x3600000000000000000000000000000000000000`

The purchase fields, full funding and Released status were independently read from the Arc Testnet RPC on 20 October 2026. Because the release transaction is atomic, the Released state confirms the contract completed its USDC transfer to the configured recipient rather than retaining a refundable escrow balance.
### Manual underfunded expiry and refund validation

- Purchase ID: `0x5a63a566e65a20b02faab7c2ad6243c283dc6e6b0659620888a8f0a78b0426c4`
- Organizer and recipient: `0xced5912f985883a0c45aa62f11d294beaa36d026`
- Target amount: `0.4 USDC`
- Funded amount: `0.2 USDC`
- Current on-chain status: `Expired` (`4`)
- Canonical USDC: `0x3600000000000000000000000000000000000000`
- Contributor wallet: `0x52b1185eF92a3281b42c9355F4b419b348b9eb68`
- Contributor amount: `0.2 USDC`
- Refund claimed on-chain: `true`

The purchase fields, underfunded balance, elapsed deadlines, Expired status, Wallet B contribution and refund-claimed flag were independently read from the Arc Testnet RPC on 20 October 2026. This verifies the completed underfunded expiry and individual refund path at current state.

## Arc Studio Mainnet export review, 20 October 2026

Arc Studio produced `JANUS-CONTRACT-EXPORT.md` and reported 68 passing contract tests. The report correctly states that the organizer may be the recipient and that only the zero address and the JanusPurchase contract itself are invalid recipients.

The report's bytecode table is not the artifact present in this workspace. It reports 4,068-byte creation and 4,032-byte runtime builds, while the referenced files remained unchanged. Independent calculation from `contracts/out/JanusPurchase.sol/JanusPurchase.json` gives:

- Creation bytecode: `4,067` bytes
- Creation hash: `0xe31a8d9c791d0af8c82766a429ef6cb08d1edb48f0f4d64ac772fb2e1ca3c161`
- Runtime bytecode: `4,031` bytes
- Runtime hash: `0xd3ea11c916fe865573651f6815bb1ad33fb57bcc15d8e1ae4df7ac6610bffcfa`

The browser deployment tool's embedded creation bytecode exactly matches this project artifact. The runtime hash exactly matches the Arc Testnet deployment used for the completed cancellation/refund, release, and underfunded-expiry/refund manual tests. The Arc Studio report's different hashes must not be used for post-deployment verification.

Arc Mainnet preflight confirmed chain ID `5042`, deployed code at canonical USDC `0x3600000000000000000000000000000000000000`, and `decimals() == 6`. Wallet A had `0.99748` ERC-20/native USDC at the checkpoint, and deployment gas estimation succeeded.

A generic Foundry Mainnet fork can read the USDC implementation and balances but cannot execute `transferFrom` because Arc Mainnet USDC calls the native blocklist precompile at `0x1800000000000000000000000000000000000001`; Foundry reports `OpcodeNotFound` for that Arc-specific precompile. This is a local fork-emulation limitation. Arc Testnet fork flows and live Testnet manual flows passed. The first Mainnet transaction through the deployed app must therefore use a minimal amount and serve as the live Mainnet integration check.

## Arc Mainnet deployment, 20 October 2026

JanusPurchase was deployed through the Privy-signed local deployment tool to Arc Mainnet:

- Contract: `0x0523d830dd2c8767678f35b774ce2decf4faf2a5`
- Deployment transaction: `0xdc9b59cd8646ce19dd71abb43d0a44ad1e6c06d5013544630e5f519ae5364a9b`
- Deployment block: `26991610`
- Deployer: `0xced5912f985883a0c45aa62f11d294beaa36d026`
- Timestamp: `2026-10-20T19:17:57Z`
- Gas used: `946,248`
- Deployment fee: `0.02311281355176372 USDC`
- Chain ID: `5042`
- Canonical USDC: `0x3600000000000000000000000000000000000000`

Independent RPC verification confirmed that `ARC_USDC()` returns canonical Arc USDC and that the deployed runtime is exactly `4,031` bytes with hash `0xd3ea11c916fe865573651f6815bb1ad33fb57bcc15d8e1ae4df7ac6610bffcfa`. The deployment transaction input is exactly `4,067` bytes with creation hash `0xe31a8d9c791d0af8c82766a429ef6cb08d1edb48f0f4d64ac772fb2e1ca3c161`. Both hashes match the locally tested artifact and the runtime previously exercised through the completed Arc Testnet flows.

The frontend and API are configured with this verified address. A minimal-value Arc Mainnet shared purchase has now been created, funded and released through the JANUS app, as recorded below.
## Arc Mainnet live purchase validation, 20 October 2026

A complete shared-purchase flow moved canonical Arc USDC through the deployed contract and JANUS app:

- Purchase ID: `0xdffbbc6c933ce8bae100af75de7a2e18fcb1afdd5ed3975802bda018f3105bff`
- Organizer/contributor: `0xced5912f985883a0c45aa62f11d294beaa36d026`
- Recipient: `0x52b1185ef92a3281b42c9355f4b419b348b9eb68`
- Target, funded and released amount: `0.01 USDC`
- Final status: `Released` (`2`)
- Creation transaction: `0x62f46670ffc69930af9361d3ed3b30ecad09fe2bb9b9f1a4b57a978650e962ea`
- Contribution/funding transaction: `0x17b1693b9af67607322d9733d54b26d83e3366b2473e38e50549bf47bd542902`
- Release transaction: `0x9f8c40c2177b0babb3a75075de4699cd10f5cd6637e4121d8b336dc68bf79954`

Independent Arc Mainnet receipt and event reads confirmed all three transactions succeeded. The canonical USDC `Transfer` log moved `0.01 USDC` from Wallet A to JanusPurchase during contribution, then moved `0.01 USDC` from JanusPurchase to Wallet B during release. The JANUS backend also stored the Mainnet purchase invitation for `@vickman` with chain ID `5042`, the verified Mainnet contract address and unread `invited` status.

This bytes32 purchase ID also exists on Arc Testnet because purchase IDs are deterministic within each deployment and both chains began with the same organizer nonce. Purchase references must therefore always include chain ID and contract address; the Mainnet evidence above is scoped to chain `5042` and contract `0x0523d830dd2c8767678f35b774ce2decf4faf2a5`.