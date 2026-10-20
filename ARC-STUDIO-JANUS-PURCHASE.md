# JANUS Shared Purchase Contract — Arc Studio Build Brief

## Arc Studio instruction

Build, review, and test the Solidity contract described below inside Arc Studio. Keep the public interface exactly as specified because the existing JANUS application already uses this ABI.

Write, review, compile, and test the completed contract inside Arc Studio. Do **not** repeat the Arc Testnet deployment. Return:

1. The final Solidity source written in Arc Studio.
2. The complete ABI.
3. Creation and deployed bytecode.
4. The creation and runtime bytecode hashes.
5. The complete unit, fuzz, invariant, and Arc-fork test results.
6. Any review findings, assumptions, or changes from this specification.
7. A Mainnet-ready export that can be deployed externally without modifying the tested source.

Do not request, display, store, or generate a Mainnet private key. Arc Mainnet deployment will be signed separately by the project owner using Wallet A after the Arc Studio output is compared with the independently tested build.

## Product purpose

JANUS lets a user create a shared USDC purchase. Contributors deposit USDC into escrow. When the target is fully funded, the organizer may release the escrow to the recipient before the release deadline. The organizer may cancel before release. An underfunded purchase becomes refundable after its funding deadline, and a fully funded but unreleased purchase becomes refundable after its release deadline. Every contributor claims their own refund.

Participant usernames, invitations, titles, descriptions, inbox records, and sharing links are application metadata. They must remain off-chain and are not part of this contract.

## Target environment

- Solidity compiler: **0.8.28**
- Solidity pragma: **^0.8.20**
- EVM version: **Paris**
- Optimizer: enabled
- Optimizer runs: **200**
- OpenZeppelin Contracts: **5.1.0**
- Test framework: Foundry
- Target networks:
  - Arc Testnet, chain ID **5042002**
  - Arc Mainnet, chain ID **5042**
- Canonical Arc USDC ERC-20 interface on both networks:
  - **0x3600000000000000000000000000000000000000**
  - **6 decimals**

## Contract identity

- File: `JanusPurchase.sol`
- Contract: `JanusPurchase`
- Constructor: none
- Upgradeability: none
- Owner/admin role: none
- Admin withdrawal or rescue function: none

Use OpenZeppelin `ReentrancyGuard`, `SafeERC20`, and `IERC20`.

## Required status model

Declare this enum in this exact order so the numeric values remain stable:

```solidity
enum Status {
    Funding,   // 0
    Funded,    // 1
    Released,  // 2
    Cancelled, // 3
    Expired    // 4
}
```

## Required storage behavior

Each purchase stores:

- organizer address
- recipient address
- USDC token address
- target amount in 6-decimal base units
- total contributed amount
- funding deadline as `uint40`
- release deadline as `uint40`
- current `Status`
- contribution amount for each contributor
- refund-claimed flag for each contributor

Keep purchases in a private `mapping(bytes32 => Purchase)`.

Keep a private nonce for each organizer in `mapping(address => uint256)`.

A new purchase ID must be:

```solidity
keccak256(abi.encode(msg.sender, organizerNonce))
```

Increment that organizer's nonce after reserving the ID.

## Exact public interface

Expose the following public constant:

```solidity
address public constant ARC_USDC = 0x3600000000000000000000000000000000000000;
```

Implement these exact functions:

```solidity
function createPurchase(
    address recipient,
    uint256 targetAmount,
    uint40 fundingDeadline,
    uint40 releaseDeadline
) external returns (bytes32 purchaseId);

function contribute(bytes32 purchaseId, uint256 amount) external;

function release(bytes32 purchaseId) external;

function cancel(bytes32 purchaseId) external;

function markExpired(bytes32 purchaseId) external;

function claimRefund(bytes32 purchaseId) external;

function getPurchase(bytes32 purchaseId)
    external
    view
    returns (
        address organizer,
        address recipient,
        address usdcToken,
        uint256 targetAmount,
        uint256 totalContributed,
        uint40 fundingDeadline,
        uint40 releaseDeadline,
        Status status
    );

function contributionOf(bytes32 purchaseId, address contributor)
    external
    view
    returns (uint256);

function isRefundClaimed(bytes32 purchaseId, address contributor)
    external
    view
    returns (bool);

function nextOrganizerNonce(address organizer)
    external
    view
    returns (uint256);
```

Apply `nonReentrant` to every state-changing external function.

## Creation rules

`createPurchase` must:

- reject the zero recipient
- reject the contract itself as recipient
- reject a zero target amount
- require `fundingDeadline > block.timestamp`
- require `releaseDeadline > fundingDeadline`
- create the purchase in `Funding` state
- store canonical Arc USDC as the token
- emit `PurchaseCreated`

## Contribution rules

`contribute` must:

- require an existing purchase
- require `Funding` status
- reject contributions at or after the funding deadline
- reject a zero amount
- reject any amount that would make total contributions exceed the target
- transfer exactly `amount` of USDC from the contributor into the contract
- update storage only as part of a transaction that successfully transfers USDC
- add to the contributor's cumulative contribution
- emit `Contributed`
- change status to `Funded` and emit `PurchaseFunded` when the target is reached exactly

## Release rules

`release` must:

- require the organizer as caller
- require `Funded` status
- reject release at or after the release deadline
- set status to `Released`
- transfer the full contributed amount to the recipient
- emit `Released`
- preserve a cancellation/refund recovery path if the token transfer fails by allowing the entire transaction to revert

## Cancellation rules

`cancel` must:

- require the organizer as caller
- allow cancellation only from `Funding` or `Funded`
- set status to `Cancelled`
- emit `Cancelled`
- leave escrow in the contract for individual contributor claims

## Expiry rules

`markExpired` must be callable by anyone.

For a `Funding` purchase:

- require the funding deadline to have arrived or passed
- require the purchase to remain underfunded

For a `Funded` purchase:

- require the release deadline to have arrived or passed

For every other status, revert.

On success, set status to `Expired` and emit `Expired`.

## Refund rules

`claimRefund` must:

- require `Cancelled` or `Expired` status
- refund only `msg.sender`
- require that caller's contribution to be greater than zero
- reject a second claim
- set the claim flag before transferring
- transfer exactly the caller's contribution
- emit `RefundClaimed`
- ensure one contributor's failed transfer cannot consume or invalidate another contributor's refund

Refunds are pull-based. Do not loop over contributors.

## Required events

Use these exact events:

```solidity
event PurchaseCreated(
    bytes32 indexed purchaseId,
    address indexed organizer,
    address indexed recipient,
    uint256 targetAmount,
    uint40 fundingDeadline,
    uint40 releaseDeadline
);

event Contributed(
    bytes32 indexed purchaseId,
    address indexed contributor,
    uint256 amount,
    uint256 totalContributed
);

event PurchaseFunded(bytes32 indexed purchaseId, uint256 totalContributed);
event Released(bytes32 indexed purchaseId, address indexed recipient, uint256 amount);
event Cancelled(bytes32 indexed purchaseId);
event Expired(bytes32 indexed purchaseId);
event RefundClaimed(bytes32 indexed purchaseId, address indexed contributor, uint256 amount);
```

## Required custom errors

Use custom errors for these conditions:

```solidity
error PurchaseNotFound(bytes32 purchaseId);
error PurchaseAlreadyExists(bytes32 purchaseId);
error InvalidStatus(bytes32 purchaseId, Status current, Status required);
error Unauthorized(bytes32 purchaseId, address caller);
error InvalidRecipient();
error InvalidTargetAmount();
error InvalidFundingDeadline();
error InvalidReleaseDeadline();
error InvalidAmount();
error Overfunding(bytes32 purchaseId, uint256 attemptedTotal, uint256 targetAmount);
error FundingClosed(bytes32 purchaseId);
error ReleaseWindowExpired(bytes32 purchaseId);
error NotExpired(bytes32 purchaseId);
error RefundUnavailable(bytes32 purchaseId, address contributor);
error RefundAlreadyClaimed(bytes32 purchaseId, address contributor);
```

## Required unit tests

Create Foundry tests covering at least:

1. Successful purchase creation and all stored fields.
2. Event values for creation.
3. Rejection of zero/self recipient, zero target, expired funding deadline, and unordered deadlines.
4. Per-organizer nonce increment and collision prevention.
5. Successful contribution and exact token accounting.
6. Multiple contributions from one wallet.
7. Multiple contributors.
8. Zero contribution rejection.
9. Overfunding rejection.
10. Contribution rejection at and after funding deadline.
11. Exact target changes status to `Funded`.
12. Organizer-only release.
13. Release rejected while underfunded.
14. Release rejected at and after release deadline.
15. Successful release pays the exact full amount.
16. Double release rejection.
17. Failed release transfer reverts without losing the cancellation/refund recovery path.
18. Organizer cancellation while `Funding`.
19. Organizer cancellation while `Funded`.
20. Non-organizer cancellation rejection.
21. Release and further contributions rejected after cancellation.
22. Underfunded expiry at the funding deadline.
23. Fully funded expiry at the release deadline.
24. Premature expiry rejection.
25. Successful refund after cancellation.
26. Successful refund after expiry.
27. Multiple contributors claim their exact individual amounts.
28. Zero-contribution refund rejection.
29. Double refund rejection.
30. One failed refund does not prevent another contributor from claiming or the first contributor from retrying.
31. Getter behavior for missing purchases.

## Required fuzz and invariant tests

Add fuzz tests proving:

- multiple contributions can reach the target exactly without rounding or accounting loss
- released amount equals the target
- each refund equals the contributor's recorded contribution

Add stateful invariant tests proving:

1. The contract's USDC balance always covers all live escrow plus all unclaimed refundable contributions.
2. The total amount still refundable for any purchase never exceeds its total contributed amount.
3. Released funds cannot also become refundable.
4. No action creates USDC from thin air.

Run at least **256 invariant runs** with **500 calls per run** for the escrow invariants.

## Arc integration tests

On an Arc fork, verify against the canonical USDC interface that:

1. A funded purchase releases the exact amount to the recipient.
2. A cancelled purchase returns the exact contribution to its contributor.

Do not use large amounts. Use the smallest practical values.

## Deployment safety checks

Before any deployment:

- verify chain ID is either 5042002 or 5042
- verify code exists at the canonical USDC address
- verify `decimals() == 6`
- compile with the settings in this document
- report creation bytecode hash and deployed/runtime bytecode hash

Before exporting the Mainnet-ready artifact:

- confirm compilation succeeds with the specified settings
- confirm every required test passes
- report creation and runtime bytecode hashes
- confirm the ABI matches the exact public interface in this brief
- confirm the artifact has no constructor arguments

Do not claim that Arc Studio submitted the Mainnet transaction. Mainnet signing and submission will be performed immediately afterward by the owner using Wallet A and the reviewed local deployment tool.
