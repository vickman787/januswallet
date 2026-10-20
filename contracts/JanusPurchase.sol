// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract JanusPurchase is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    enum Status {
        Funding,
        Funded,
        Released,
        Cancelled,
        Expired
    }

    struct Purchase {
        address organizer;
        address recipient;
        address usdcToken;
        uint256 targetAmount;
        uint256 totalContributed;
        uint40 fundingDeadline;
        uint40 releaseDeadline;
        Status status;
        mapping(address => uint256) contributions;
        mapping(address => bool) refundClaimed;
    }

    mapping(bytes32 => Purchase) private _purchases;
    mapping(address => uint256) private _organizerNonces;

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

    function createPurchase(
        address recipient,
        uint256 targetAmount,
        uint40 fundingDeadline,
        uint40 releaseDeadline
    ) external nonReentrant returns (bytes32 purchaseId) {
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        if (targetAmount == 0) revert InvalidTargetAmount();
        if (fundingDeadline <= block.timestamp) revert InvalidFundingDeadline();
        if (releaseDeadline <= fundingDeadline) revert InvalidReleaseDeadline();

        uint256 nonce = _organizerNonces[msg.sender];
        purchaseId = keccak256(abi.encode(msg.sender, nonce));

        Purchase storage purchase = _purchases[purchaseId];
        if (purchase.organizer != address(0)) revert PurchaseAlreadyExists(purchaseId);

        _organizerNonces[msg.sender] = nonce + 1;

        purchase.organizer = msg.sender;
        purchase.recipient = recipient;
        purchase.usdcToken = ARC_USDC;
        purchase.targetAmount = targetAmount;
        purchase.fundingDeadline = fundingDeadline;
        purchase.releaseDeadline = releaseDeadline;
        purchase.status = Status.Funding;

        emit PurchaseCreated(
            purchaseId,
            msg.sender,
            recipient,
            targetAmount,
            fundingDeadline,
            releaseDeadline
        );
    }

    function contribute(bytes32 purchaseId, uint256 amount) external nonReentrant {
        Purchase storage purchase = _requirePurchase(purchaseId);

        if (purchase.status != Status.Funding) {
            revert InvalidStatus(purchaseId, purchase.status, Status.Funding);
        }
        if (block.timestamp >= purchase.fundingDeadline) revert FundingClosed(purchaseId);
        if (amount == 0) revert InvalidAmount();

        uint256 newTotal = purchase.totalContributed + amount;
        if (newTotal > purchase.targetAmount) {
            revert Overfunding(purchaseId, newTotal, purchase.targetAmount);
        }

        IERC20(purchase.usdcToken).safeTransferFrom(msg.sender, address(this), amount);

        purchase.totalContributed = newTotal;
        purchase.contributions[msg.sender] += amount;

        emit Contributed(purchaseId, msg.sender, amount, newTotal);

        if (newTotal == purchase.targetAmount) {
            purchase.status = Status.Funded;
            emit PurchaseFunded(purchaseId, newTotal);
        }
    }

    function release(bytes32 purchaseId) external nonReentrant {
        Purchase storage purchase = _requirePurchase(purchaseId);

        if (msg.sender != purchase.organizer) revert Unauthorized(purchaseId, msg.sender);
        if (purchase.status != Status.Funded) {
            revert InvalidStatus(purchaseId, purchase.status, Status.Funded);
        }
        if (block.timestamp >= purchase.releaseDeadline) revert ReleaseWindowExpired(purchaseId);

        uint256 amount = purchase.totalContributed;
        purchase.status = Status.Released;

        IERC20(purchase.usdcToken).safeTransfer(purchase.recipient, amount);

        emit Released(purchaseId, purchase.recipient, amount);
    }

    function cancel(bytes32 purchaseId) external nonReentrant {
        Purchase storage purchase = _requirePurchase(purchaseId);

        if (msg.sender != purchase.organizer) revert Unauthorized(purchaseId, msg.sender);
        if (purchase.status != Status.Funding && purchase.status != Status.Funded) {
            revert InvalidStatus(purchaseId, purchase.status, Status.Funding);
        }

        purchase.status = Status.Cancelled;
        emit Cancelled(purchaseId);
    }

    function markExpired(bytes32 purchaseId) external nonReentrant {
        Purchase storage purchase = _requirePurchase(purchaseId);

        if (purchase.status == Status.Funding) {
            if (block.timestamp < purchase.fundingDeadline || purchase.totalContributed >= purchase.targetAmount) {
                revert NotExpired(purchaseId);
            }
        } else if (purchase.status == Status.Funded) {
            if (block.timestamp < purchase.releaseDeadline) revert NotExpired(purchaseId);
        } else {
            revert InvalidStatus(purchaseId, purchase.status, Status.Funding);
        }

        purchase.status = Status.Expired;
        emit Expired(purchaseId);
    }

    function claimRefund(bytes32 purchaseId) external nonReentrant {
        Purchase storage purchase = _requirePurchase(purchaseId);

        if (purchase.status != Status.Cancelled && purchase.status != Status.Expired) {
            revert RefundUnavailable(purchaseId, msg.sender);
        }

        uint256 amount = purchase.contributions[msg.sender];
        if (amount == 0) revert RefundUnavailable(purchaseId, msg.sender);
        if (purchase.refundClaimed[msg.sender]) revert RefundAlreadyClaimed(purchaseId, msg.sender);

        purchase.refundClaimed[msg.sender] = true;

        IERC20(purchase.usdcToken).safeTransfer(msg.sender, amount);

        emit RefundClaimed(purchaseId, msg.sender, amount);
    }

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
        )
    {
        Purchase storage purchase = _requirePurchase(purchaseId);
        return (
            purchase.organizer,
            purchase.recipient,
            purchase.usdcToken,
            purchase.targetAmount,
            purchase.totalContributed,
            purchase.fundingDeadline,
            purchase.releaseDeadline,
            purchase.status
        );
    }

    function contributionOf(bytes32 purchaseId, address contributor) external view returns (uint256) {
        Purchase storage purchase = _requirePurchase(purchaseId);
        return purchase.contributions[contributor];
    }

    function isRefundClaimed(bytes32 purchaseId, address contributor) external view returns (bool) {
        Purchase storage purchase = _requirePurchase(purchaseId);
        return purchase.refundClaimed[contributor];
    }

    function nextOrganizerNonce(address organizer) external view returns (uint256) {
        return _organizerNonces[organizer];
    }

    function _requirePurchase(bytes32 purchaseId) private view returns (Purchase storage purchase) {
        purchase = _purchases[purchaseId];
        if (purchase.organizer == address(0)) revert PurchaseNotFound(purchaseId);
    }
}
