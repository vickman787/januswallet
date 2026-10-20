# JANUS JanusPurchase — Arc Studio Contract Brief

Build, review, compile, and test this contract inside Arc Studio. Do not deploy another Testnet contract. Return the final Solidity source, ABI, creation/runtime bytecode and hashes, full test results, and a Mainnet-ready export. Do not request a private key or submit a Mainnet transaction; the owner will deploy the tested artifact externally with Wallet A.

Keep the public interface exact because the JANUS app already uses this ABI.

## Environment

- File/contract: `JanusPurchase.sol` / `JanusPurchase`
- Solidity 0.8.28; pragma ^0.8.20
- EVM Paris; optimizer on, 200 runs
- OpenZeppelin Contracts 5.1.0
- Foundry tests
- Arc Testnet 5042002; Arc Mainnet 5042
- Canonical Arc USDC on both: `0x3600000000000000000000000000000000000000`, 6 decimals
- No constructor parameters, owner/admin, proxy, upgrade, rescue, or admin withdrawal
- Use `ReentrancyGuard`, `SafeERC20`, and `IERC20`

Usernames, participant invitations, titles, descriptions, inbox records, and links are off-chain application metadata.

## Status and storage

Use this exact enum order:

```solidity
enum Status { Funding, Funded, Released, Cancelled, Expired }
```

Each purchase stores organizer, recipient, USDC token, target amount, total contributed, uint40 funding deadline, uint40 release deadline, status, each address's contribution, and each address's refund-claimed flag.

Use private `mapping(bytes32 => Purchase) _purchases` and private per-organizer nonce mapping. Purchase ID must equal `keccak256(abi.encode(msg.sender, organizerNonce))`; increment the nonce after reserving the ID.

## Exact interface

```solidity
address public constant ARC_USDC =
    0x3600000000000000000000000000000000000000;

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

function getPurchase(bytes32 purchaseId) external view returns (
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
    external view returns (uint256);

function isRefundClaimed(bytes32 purchaseId, address contributor)
    external view returns (bool);

function nextOrganizerNonce(address organizer)
    external view returns (uint256);
```

Apply `nonReentrant` to every state-changing external function.

## Rules

`createPurchase` rejects only the zero recipient and the contract itself (`recipient == address(this)`). It MUST allow `recipient == msg.sender`; the organizer is commonly the purchase recipient. Also reject zero target, funding deadline <= current timestamp, and release deadline <= funding deadline. Store canonical USDC, start in Funding, and emit PurchaseCreated.

`contribute` requires an existing Funding purchase, timestamp before funding deadline, nonzero amount, and new total <= target. Pull exactly the amount with SafeERC20, update total and caller's cumulative contribution, and emit Contributed. When total exactly reaches target, change to Funded and emit PurchaseFunded.

`release` requires organizer, Funded status, and timestamp before release deadline. Set Released, transfer the full total to recipient, and emit Released. A failed transfer must revert the complete transaction so cancellation/refund remains possible.

`cancel` requires organizer and Funding or Funded status. Set Cancelled, emit Cancelled, and leave escrow for individual claims.

`markExpired` is permissionless. A Funding purchase expires only at/after its funding deadline while underfunded. A Funded purchase expires only at/after its release deadline. Other statuses revert. Set Expired and emit Expired.

`claimRefund` requires Cancelled or Expired status, caller contribution > 0, and no prior claim. Mark claimed before transferring exactly the caller's contribution and emit RefundClaimed. Refunds are pull-based; never loop through contributors. One failed claim must not affect another contributor.

## Exact events

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

## Custom errors

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

## Tests

Test all successful paths and every rule/revert above, including boundary timestamps, nonce uniqueness, exact funding, overfunding, multiple contributions, multiple contributors, organizer permissions, failed release transfer recovery, cancellation in Funding/Funded, underfunded expiry, funded expiry, exact individual refunds, double-claim rejection, and isolated failed refund/retry.

Add fuzz tests proving exact target funding, exact release amount, and refund == recorded contribution.

Add stateful invariants with at least 256 runs and 500 calls per run proving:

1. Contract USDC balance covers all live escrow plus all unclaimed refunds.
2. Refundable total never exceeds total contributed.
3. Released funds cannot be refunded.
4. No action creates USDC.

On an Arc fork, test exact release and cancellation/refund against canonical USDC using minimal amounts.

## Output and deployment checks

Before export, verify chain configuration, code at canonical USDC, and `decimals() == 6`. Confirm compilation, every test, exact ABI, no constructor arguments, and report creation/runtime bytecode hashes.

Return:

1. Final `JanusPurchase.sol`
2. ABI
3. Creation and runtime bytecode
4. Both bytecode hashes
5. Complete test summary
6. Review findings or deviations
7. Mainnet-ready export using the exact tested source

Do not submit Mainnet deployment. The owner will immediately deploy the verified artifact to Arc Mainnet with the funded Privy Wallet A through the reviewed JANUS deployment page.
