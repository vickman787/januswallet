// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract JanusSplitter is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_PARTICIPANTS = 20;

    enum BillStatus {
        Open,
        Settled,
        Refunded,
        Cancelled
    }

    struct Bill {
        address creator;
        address recipient;
        uint256 totalAmount;
        uint256 amountPaid;
        uint256 deadline;
        BillStatus status;
        bytes32 description;
        address[] participants;
        uint256[] shares;
        mapping(address => bool) hasPaid;
        mapping(address => uint256) paidAmount;
    }

    IERC20 public immutable usdc;

    uint256 private _billCount;
    mapping(uint256 => Bill) private _bills;
    mapping(uint256 => mapping(address => uint256)) public refundableBalance;
    mapping(uint256 => uint256) public recipientClaimable;

    event BillCreated(
        uint256 indexed billId,
        address indexed creator,
        address indexed recipient,
        uint256 totalAmount,
        uint256 deadline
    );
    event SharePaid(uint256 indexed billId, address indexed participant, uint256 amount);
    event BillSettled(uint256 indexed billId, address indexed recipient, uint256 totalAmount);
    event BillRefunded(uint256 indexed billId);
    event RefundClaimed(uint256 indexed billId, address indexed participant, uint256 amount);
    event BillCancelled(uint256 indexed billId);
    event SettlementClaimed(uint256 indexed billId, address indexed recipient, uint256 amount);

    error InvalidUSDC();
    error BillNotFound(uint256 billId);
    error InvalidRecipient();
    error InvalidArrayLengths();
    error InvalidParticipantsLength();
    error InvalidDeadline();
    error ZeroShareNotAllowed();
    error NotBillCreator();
    error BillNotOpen();
    error NotParticipant();
    error AlreadyPaid();
    error CannotSettle();
    error RefundNotAllowed();
    error CannotRefundFullyPaid();
    error CannotCancelAfterPayment();
    error DeadlinePassed();
    error InvalidParticipant();
    error DuplicateParticipant();
    error NoRefundAvailable();
    error DeadlineNotReached();
    error NoSettlementToClaim();
    error NotRecipient();

    constructor(address usdc_, address initialOwner) Ownable(initialOwner) {
        if (usdc_ == address(0)) revert InvalidUSDC();
        if (usdc_.code.length == 0) revert InvalidUSDC();
        usdc = IERC20(usdc_);
    }

    function createBill(
        address recipient,
        uint256[] calldata shares,
        address[] calldata participants,
        bytes32 description,
        uint256 deadline
    ) external returns (uint256 billId) {
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        if (participants.length == 0 || participants.length > MAX_PARTICIPANTS) revert InvalidParticipantsLength();
        if (shares.length != participants.length) revert InvalidArrayLengths();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        uint256 totalAmount;
        for (uint256 i = 0; i < shares.length; i++) {
            uint256 share = shares[i];
            if (share == 0) revert ZeroShareNotAllowed();
            totalAmount += share;
        }

        for (uint256 i = 0; i < participants.length; i++) {
            if (participants[i] == address(0)) revert InvalidParticipant();
            for (uint256 j = i + 1; j < participants.length; j++) {
                if (participants[i] == participants[j]) revert DuplicateParticipant();
            }
        }

        billId = ++_billCount;
        Bill storage bill = _bills[billId];

        bill.creator = msg.sender;
        bill.recipient = recipient;
        bill.totalAmount = totalAmount;
        bill.deadline = deadline;
        bill.status = BillStatus.Open;
        bill.description = description;

        for (uint256 i = 0; i < participants.length; i++) {
            bill.participants.push(participants[i]);
            bill.shares.push(shares[i]);
        }

        emit BillCreated(billId, msg.sender, recipient, totalAmount, deadline);
    }

    function payShare(uint256 billId) external nonReentrant {
        Bill storage bill = _getExistingBill(billId);
        if (bill.status != BillStatus.Open) revert BillNotOpen();
        if (block.timestamp > bill.deadline) revert DeadlinePassed();
        if (bill.hasPaid[msg.sender]) revert AlreadyPaid();

        uint256 share = _shareOf(bill, msg.sender);
        if (share == 0) revert NotParticipant();

        bill.hasPaid[msg.sender] = true;
        bill.paidAmount[msg.sender] = share;
        bill.amountPaid += share;

        usdc.safeTransferFrom(msg.sender, address(this), share);

        emit SharePaid(billId, msg.sender, share);
    }

    function settle(uint256 billId) external nonReentrant {
        Bill storage bill = _getExistingBill(billId);
        if (bill.status != BillStatus.Open) revert BillNotOpen();

        bool fullyPaid = bill.amountPaid == bill.totalAmount;
        bool afterDeadlineWithAnyPayment = block.timestamp > bill.deadline && bill.amountPaid > 0;
        if (!fullyPaid && !afterDeadlineWithAnyPayment) revert CannotSettle();
        if (!fullyPaid && bill.creator != msg.sender) revert NotBillCreator();

        uint256 payoutAmount = bill.amountPaid;
        bill.status = BillStatus.Settled;

        if (!_tryTransfer(bill.recipient, payoutAmount)) {
            recipientClaimable[billId] = payoutAmount;
        }

        emit BillSettled(billId, bill.recipient, payoutAmount);
    }

    function finalizeAfterDeadline(uint256 billId) external nonReentrant {
        Bill storage bill = _getExistingBill(billId);
        if (bill.status != BillStatus.Open) revert BillNotOpen();
        if (block.timestamp <= bill.deadline) revert DeadlineNotReached();

        if (bill.amountPaid == bill.totalAmount) {
            uint256 payoutAmount = bill.amountPaid;
            bill.status = BillStatus.Settled;

            if (!_tryTransfer(bill.recipient, payoutAmount)) {
                recipientClaimable[billId] = payoutAmount;
            }

            emit BillSettled(billId, bill.recipient, payoutAmount);
            return;
        }

        bill.status = BillStatus.Refunded;

        for (uint256 i = 0; i < bill.participants.length; i++) {
            address participant = bill.participants[i];
            uint256 amount = bill.paidAmount[participant];
            if (amount > 0) {
                refundableBalance[billId][participant] = amount;
                bill.paidAmount[participant] = 0;
            }
        }

        emit BillRefunded(billId);
    }

    function refund(uint256 billId) external nonReentrant {
        Bill storage bill = _getExistingBill(billId);
        if (bill.creator != msg.sender) revert NotBillCreator();
        if (bill.status != BillStatus.Open) revert BillNotOpen();
        if (block.timestamp <= bill.deadline) revert RefundNotAllowed();
        if (bill.amountPaid == bill.totalAmount) revert CannotRefundFullyPaid();

        bill.status = BillStatus.Refunded;

        for (uint256 i = 0; i < bill.participants.length; i++) {
            address participant = bill.participants[i];
            uint256 amount = bill.paidAmount[participant];
            if (amount > 0) {
                refundableBalance[billId][participant] = amount;
                bill.paidAmount[participant] = 0;
            }
        }

        emit BillRefunded(billId);
    }

    function claimRefund(uint256 billId) external nonReentrant {
        uint256 amount = refundableBalance[billId][msg.sender];
        if (amount == 0) revert NoRefundAvailable();

        refundableBalance[billId][msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit RefundClaimed(billId, msg.sender, amount);
    }

    function claimSettlement(uint256 billId) external nonReentrant {
        uint256 amount = recipientClaimable[billId];
        if (amount == 0) revert NoSettlementToClaim();

        Bill storage bill = _getExistingBill(billId);
        if (msg.sender != bill.recipient) revert NotRecipient();

        recipientClaimable[billId] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit SettlementClaimed(billId, msg.sender, amount);
    }

    function cancel(uint256 billId) external {
        Bill storage bill = _getExistingBill(billId);
        if (bill.creator != msg.sender) revert NotBillCreator();
        if (bill.status != BillStatus.Open) revert BillNotOpen();
        if (bill.amountPaid != 0) revert CannotCancelAfterPayment();

        bill.status = BillStatus.Cancelled;

        emit BillCancelled(billId);
    }

    function getBill(
        uint256 billId
    )
        external
        view
        returns (
            address creator,
            address recipient,
            uint256 totalAmount,
            uint256 amountPaid,
            uint256 deadline,
            BillStatus status,
            bytes32 description,
            address[] memory participants,
            uint256[] memory shares
        )
    {
        Bill storage bill = _getExistingBill(billId);
        return (
            bill.creator,
            bill.recipient,
            bill.totalAmount,
            bill.amountPaid,
            bill.deadline,
            bill.status,
            bill.description,
            bill.participants,
            bill.shares
        );
    }

    function hasParticipantPaid(uint256 billId, address participant) external view returns (bool) {
        Bill storage bill = _getExistingBill(billId);
        return bill.hasPaid[participant];
    }

    function getBillCount() external view returns (uint256) {
        return _billCount;
    }

    function _getExistingBill(uint256 billId) internal view returns (Bill storage bill) {
        if (billId == 0 || billId > _billCount) revert BillNotFound(billId);
        bill = _bills[billId];
    }

    function _shareOf(Bill storage bill, address participant) internal view returns (uint256) {
        for (uint256 i = 0; i < bill.participants.length; i++) {
            if (bill.participants[i] == participant) {
                return bill.shares[i];
            }
        }
        return 0;
    }

    function _tryTransfer(address to, uint256 amount) internal returns (bool) {
        // USDC contract existence is validated in the constructor via usdc_.code.length.
        (bool ok, bytes memory data) = address(usdc).call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        return ok && (data.length == 0 || abi.decode(data, (bool)));
    }
}
