// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {JanusSplitter} from "../JanusSplitter.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Invariant handler
// ─────────────────────────────────────────────────────────────────────────────

/// @dev Handler that drives the invariant fuzzer through realistic bill
///      lifecycle actions. Tracks ghost accounting so the invariant
///      contract can assert conservation of funds.
contract SplitterHandler is Test {
    JanusSplitter public splitter;
    MockERC20 public usdc;

    // ghost: total USDC that participants have deposited into the splitter
    uint256 public ghostDeposited;
    // ghost: total USDC that has been paid OUT (settled or refunded)
    uint256 public ghostPaidOut;

    address internal creator;
    address internal alice;
    address internal bob;
    address internal carol;
    address internal recipient;

    uint256 public activeBillId;
    bool public billCreated;
    bool public billFinalized;

    constructor(JanusSplitter _splitter, MockERC20 _usdc) {
        splitter = _splitter;
        usdc = _usdc;
        creator = makeAddr("h_creator");
        alice = makeAddr("h_alice");
        bob = makeAddr("h_bob");
        carol = makeAddr("h_carol");
        recipient = makeAddr("h_recipient");

        // Pre-approve
        vm.prank(alice);
        usdc.approve(address(splitter), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(splitter), type(uint256).max);
        vm.prank(carol);
        usdc.approve(address(splitter), type(uint256).max);
    }

    function createBill(uint256 aliceShare, uint256 bobShare, uint256 carolShare, uint256 deadlineOffset)
        external
    {
        if (billCreated) return;

        aliceShare = bound(aliceShare, 1, 1_000e6);
        bobShare = bound(bobShare, 1, 1_000e6);
        carolShare = bound(carolShare, 1, 1_000e6);
        deadlineOffset = bound(deadlineOffset, 1, 7 days);

        address[] memory participants = new address[](3);
        participants[0] = alice;
        participants[1] = bob;
        participants[2] = carol;

        uint256[] memory shares = new uint256[](3);
        shares[0] = aliceShare;
        shares[1] = bobShare;
        shares[2] = carolShare;

        vm.prank(creator);
        activeBillId = splitter.createBill(recipient, shares, participants, bytes32(0), block.timestamp + deadlineOffset);
        billCreated = true;
    }

    function payShare(uint8 who) external {
        if (!billCreated || billFinalized) return;
        (, , , , uint256 deadline, JanusSplitter.BillStatus status, , , ) = splitter.getBill(activeBillId);
        if (status != JanusSplitter.BillStatus.Open) return;
        if (block.timestamp > deadline) return;

        address payer = _who(who);
        if (splitter.hasParticipantPaid(activeBillId, payer)) return;
        (, , uint256 totalAmount, , , , , , uint256[] memory bShares) = splitter.getBill(activeBillId);
        uint256 idx = _indexOf(who);
        uint256 share = bShares[idx];
        usdc.mint(payer, share);
        vm.prank(payer);
        splitter.payShare(activeBillId);
        ghostDeposited += share;
    }

    function finalizeAfterDeadline() external {
        if (!billCreated || billFinalized) return;
        (, , , , uint256 deadline, JanusSplitter.BillStatus status, , , ) = splitter.getBill(activeBillId);
        if (status != JanusSplitter.BillStatus.Open) return;
        if (block.timestamp <= deadline) return;

        (, , , uint256 amountPaid, , , , , ) = splitter.getBill(activeBillId);
        splitter.finalizeAfterDeadline(activeBillId);
        billFinalized = true;
        // funds leave the contract on settle; on refund they stay claimable
        if (status == JanusSplitter.BillStatus.Open) {
            // if fully paid → settled: payout = amountPaid
            // if partial → refunded: each participant can claim back
            // Either way the splitter should hold ≥ what's owed
        }
    }

    function _who(uint8 n) internal view returns (address) {
        if (n % 3 == 0) return alice;
        if (n % 3 == 1) return bob;
        return carol;
    }

    function _indexOf(uint8 n) internal pure returns (uint256) {
        return n % 3;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main test contract
// ─────────────────────────────────────────────────────────────────────────────

contract JanusSplitterTest is Test {
    // ── Contracts ────────────────────────────────────────────────────────────
    JanusSplitter internal splitter;
    MockERC20 internal usdc;

    // ── Actors ───────────────────────────────────────────────────────────────
    address internal deployer = makeAddr("deployer");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal recipient = makeAddr("recipient");
    address internal stranger = makeAddr("stranger");

    // ── Amounts ──────────────────────────────────────────────────────────────
    uint256 internal constant ALICE_SHARE = 100e6;
    uint256 internal constant BOB_SHARE = 200e6;
    uint256 internal constant CAROL_SHARE = 300e6;
    uint256 internal constant TOTAL = ALICE_SHARE + BOB_SHARE + CAROL_SHARE;

    uint256 internal constant DEADLINE_OFFSET = 1 days;

    // ── Storage ──────────────────────────────────────────────────────────────
    uint256 internal deadline;
    uint256 internal billId;

    // ─────────────────────────────────────────────────────────────────────────
    // setUp
    // ─────────────────────────────────────────────────────────────────────────

    function setUp() public {
        // Deploy mock USDC
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);

        // Deploy splitter (mock USDC has code → passes constructor check)
        vm.prank(deployer);
        splitter = new JanusSplitter(address(usdc), deployer);

        // Mint and approve for all participants
        _fundAndApprove(alice, 10_000e6);
        _fundAndApprove(bob, 10_000e6);
        _fundAndApprove(carol, 10_000e6);

        // Create a standard 3-person bill used by most tests
        deadline = block.timestamp + DEADLINE_OFFSET;
        billId = _createStandardBill();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _fundAndApprove(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(splitter), type(uint256).max);
    }

    function _createStandardBill() internal returns (uint256) {
        address[] memory participants = new address[](3);
        participants[0] = alice;
        participants[1] = bob;
        participants[2] = carol;

        uint256[] memory shares = new uint256[](3);
        shares[0] = ALICE_SHARE;
        shares[1] = BOB_SHARE;
        shares[2] = CAROL_SHARE;

        vm.prank(creator);
        return splitter.createBill(recipient, shares, participants, bytes32("test bill"), deadline);
    }

    function _payAll() internal {
        vm.prank(alice);
        splitter.payShare(billId);
        vm.prank(bob);
        splitter.payShare(billId);
        vm.prank(carol);
        splitter.payShare(billId);
    }

    function _getBillStatus() internal view returns (JanusSplitter.BillStatus) {
        (, , , , , JanusSplitter.BillStatus status, , , ) = splitter.getBill(billId);
        return status;
    }

    function _getAmountPaid() internal view returns (uint256) {
        (, , , uint256 amountPaid, , , , , ) = splitter.getBill(billId);
        return amountPaid;
    }

    // =========================================================================
    // SECTION 1: Constructor / deployment
    // =========================================================================

    function test_Constructor_SetsUsdc() public view {
        assertEq(address(splitter.usdc()), address(usdc));
    }

    function test_Constructor_SetsOwner() public view {
        assertEq(splitter.owner(), deployer);
    }

    function test_Constructor_RevertsOnZeroUsdc() public {
        vm.expectRevert(JanusSplitter.InvalidUSDC.selector);
        new JanusSplitter(address(0), deployer);
    }

    function test_Constructor_RevertsOnEOAUsdc() public {
        address eoa = makeAddr("eoa");
        vm.expectRevert(JanusSplitter.InvalidUSDC.selector);
        new JanusSplitter(eoa, deployer);
    }

    // =========================================================================
    // SECTION 2: createBill
    // =========================================================================

    function test_CreateBill_HappyPath() public {
        address[] memory participants = new address[](2);
        participants[0] = alice;
        participants[1] = bob;

        uint256[] memory shares = new uint256[](2);
        shares[0] = 50e6;
        shares[1] = 50e6;

        uint256 dl = block.timestamp + 2 days;

        vm.expectEmit(true, true, true, true, address(splitter));
        emit JanusSplitter.BillCreated(2, creator, recipient, 100e6, dl);

        vm.prank(creator);
        uint256 id = splitter.createBill(recipient, shares, participants, bytes32("desc"), dl);

        assertEq(id, 2); // second bill (setUp already created billId=1)

        (
            address billCreator,
            address billRecipient,
            uint256 totalAmount,
            uint256 amountPaid,
            uint256 billDeadline,
            JanusSplitter.BillStatus status,
            bytes32 description,
            address[] memory billParticipants,
            uint256[] memory billShares
        ) = splitter.getBill(id);

        assertEq(billCreator, creator);
        assertEq(billRecipient, recipient);
        assertEq(totalAmount, 100e6);
        assertEq(amountPaid, 0);
        assertEq(billDeadline, dl);
        assertEq(uint8(status), uint8(JanusSplitter.BillStatus.Open));
        assertEq(description, bytes32("desc"));
        assertEq(billParticipants[0], alice);
        assertEq(billParticipants[1], bob);
        assertEq(billShares[0], 50e6);
        assertEq(billShares[1], 50e6);
        assertEq(splitter.getBillCount(), 2);
    }

    function test_CreateBill_RevertZeroRecipient() public {
        address[] memory participants = new address[](1);
        participants[0] = alice;
        uint256[] memory shares = new uint256[](1);
        shares[0] = 100e6;

        vm.prank(creator);
        vm.expectRevert(JanusSplitter.InvalidRecipient.selector);
        splitter.createBill(address(0), shares, participants, bytes32(0), block.timestamp + 1);
    }

    function test_CreateBill_RevertEmptyParticipants() public {
        address[] memory participants = new address[](0);
        uint256[] memory shares = new uint256[](0);

        vm.prank(creator);
        vm.expectRevert(JanusSplitter.InvalidParticipantsLength.selector);
        splitter.createBill(recipient, shares, participants, bytes32(0), block.timestamp + 1);
    }

    function test_CreateBill_RevertTooManyParticipants() public {
        uint256 n = splitter.MAX_PARTICIPANTS() + 1;
        address[] memory participants = new address[](n);
        uint256[] memory shares = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            participants[i] = address(uint160(i + 100));
            shares[i] = 1e6;
        }

        vm.prank(creator);
        vm.expectRevert(JanusSplitter.InvalidParticipantsLength.selector);
        splitter.createBill(recipient, shares, participants, bytes32(0), block.timestamp + 1);
    }

    function test_CreateBill_RevertSharesLengthMismatch() public {
        address[] memory participants = new address[](2);
        participants[0] = alice;
        participants[1] = bob;
        uint256[] memory shares = new uint256[](1);
        shares[0] = 100e6;

        vm.prank(creator);
        vm.expectRevert(JanusSplitter.InvalidArrayLengths.selector);
        splitter.createBill(recipient, shares, participants, bytes32(0), block.timestamp + 1);
    }

    function test_CreateBill_RevertPastDeadline() public {
        address[] memory participants = new address[](1);
        participants[0] = alice;
        uint256[] memory shares = new uint256[](1);
        shares[0] = 100e6;

        vm.prank(creator);
        vm.expectRevert(JanusSplitter.InvalidDeadline.selector);
        splitter.createBill(recipient, shares, participants, bytes32(0), block.timestamp);
    }

    function test_CreateBill_RevertZeroShare() public {
        address[] memory participants = new address[](2);
        participants[0] = alice;
        participants[1] = bob;
        uint256[] memory shares = new uint256[](2);
        shares[0] = 0;
        shares[1] = 100e6;

        vm.prank(creator);
        vm.expectRevert(JanusSplitter.ZeroShareNotAllowed.selector);
        splitter.createBill(recipient, shares, participants, bytes32(0), block.timestamp + 1);
    }

    function test_CreateBill_RevertDuplicateParticipant() public {
        address[] memory participants = new address[](2);
        participants[0] = alice;
        participants[1] = alice; // duplicate
        uint256[] memory shares = new uint256[](2);
        shares[0] = 50e6;
        shares[1] = 50e6;

        vm.prank(creator);
        vm.expectRevert(JanusSplitter.DuplicateParticipant.selector);
        splitter.createBill(recipient, shares, participants, bytes32(0), block.timestamp + 1);
    }

    function test_CreateBill_RevertZeroAddressParticipant() public {
        address[] memory participants = new address[](2);
        participants[0] = alice;
        participants[1] = address(0);
        uint256[] memory shares = new uint256[](2);
        shares[0] = 50e6;
        shares[1] = 50e6;

        vm.prank(creator);
        vm.expectRevert(JanusSplitter.InvalidParticipant.selector);
        splitter.createBill(recipient, shares, participants, bytes32(0), block.timestamp + 1);
    }

    function test_CreateBill_IncrementsBillCount() public view {
        // setUp created billId=1
        assertEq(splitter.getBillCount(), 1);
    }

    // =========================================================================
    // SECTION 3: payShare
    // =========================================================================

    function test_PayShare_HappyPath() public {
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 splitterBefore = usdc.balanceOf(address(splitter));

        vm.expectEmit(true, true, false, true, address(splitter));
        emit JanusSplitter.SharePaid(billId, alice, ALICE_SHARE);

        vm.prank(alice);
        splitter.payShare(billId);

        assertEq(usdc.balanceOf(alice), aliceBefore - ALICE_SHARE);
        assertEq(usdc.balanceOf(address(splitter)), splitterBefore + ALICE_SHARE);
        assertEq(_getAmountPaid(), ALICE_SHARE);
        assertTrue(splitter.hasParticipantPaid(billId, alice));
    }

    function test_PayShare_RevertNotParticipant() public {
        vm.prank(stranger);
        vm.expectRevert(JanusSplitter.NotParticipant.selector);
        splitter.payShare(billId);
    }

    function test_PayShare_RevertAlreadyPaid() public {
        vm.prank(alice);
        splitter.payShare(billId);

        vm.prank(alice);
        vm.expectRevert(JanusSplitter.AlreadyPaid.selector);
        splitter.payShare(billId);
    }

    function test_PayShare_RevertBillNotOpen() public {
        // Cancel the bill first
        vm.prank(creator);
        splitter.cancel(billId);

        vm.prank(alice);
        vm.expectRevert(JanusSplitter.BillNotOpen.selector);
        splitter.payShare(billId);
    }

    function test_PayShare_RevertAfterDeadline() public {
        vm.warp(deadline + 1);

        vm.prank(alice);
        vm.expectRevert(JanusSplitter.DeadlinePassed.selector);
        splitter.payShare(billId);
    }

    function test_PayShare_RevertBillNotFound() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(JanusSplitter.BillNotFound.selector, 999));
        splitter.payShare(999);
    }

    // =========================================================================
    // SECTION 4: settle
    // =========================================================================

    function test_Settle_HappyPath_FullyPaid_AnyoneCan() public {
        _payAll();

        uint256 recipientBefore = usdc.balanceOf(recipient);

        vm.expectEmit(true, true, false, true, address(splitter));
        emit JanusSplitter.BillSettled(billId, recipient, TOTAL);

        // stranger (not creator, not participant) can call settle when fully paid
        vm.prank(stranger);
        splitter.settle(billId);

        assertEq(uint8(_getBillStatus()), uint8(JanusSplitter.BillStatus.Settled));
        assertEq(usdc.balanceOf(recipient), recipientBefore + TOTAL);
    }

    function test_Settle_PartialAfterDeadline_CreatorOnly() public {
        // alice pays only
        vm.prank(alice);
        splitter.payShare(billId);

        vm.warp(deadline + 1);

        uint256 recipientBefore = usdc.balanceOf(recipient);

        vm.prank(creator);
        splitter.settle(billId);

        assertEq(uint8(_getBillStatus()), uint8(JanusSplitter.BillStatus.Settled));
        // Only alice's share was paid out
        assertEq(usdc.balanceOf(recipient), recipientBefore + ALICE_SHARE);
    }

    function test_Settle_RevertNotOpen() public {
        // Cancel first
        vm.prank(creator);
        splitter.cancel(billId);

        vm.prank(creator);
        vm.expectRevert(JanusSplitter.BillNotOpen.selector);
        splitter.settle(billId);
    }

    function test_Settle_RevertNotEnoughPaidBeforeDeadline() public {
        // Only partially paid, deadline not reached
        vm.prank(alice);
        splitter.payShare(billId);

        vm.prank(stranger);
        vm.expectRevert(JanusSplitter.CannotSettle.selector);
        splitter.settle(billId);
    }

    function test_Settle_RevertNonCreatorWhenPartialAfterDeadline() public {
        vm.prank(alice);
        splitter.payShare(billId);

        vm.warp(deadline + 1);

        vm.prank(stranger);
        vm.expectRevert(JanusSplitter.NotBillCreator.selector);
        splitter.settle(billId);
    }

    function test_Settle_RevertCannotSettleZeroAfterDeadline() public {
        // No payments at all, deadline passed → amountPaid == 0
        vm.warp(deadline + 1);

        vm.prank(creator);
        vm.expectRevert(JanusSplitter.CannotSettle.selector);
        splitter.settle(billId);
    }

    function test_Settle_TryTransferFails_RecipientClaimable() public {
        _payAll();

        // Force transfer to fail so contract falls back to recipientClaimable
        usdc.setFailTransfers(true);

        vm.prank(stranger);
        splitter.settle(billId);

        assertEq(uint8(_getBillStatus()), uint8(JanusSplitter.BillStatus.Settled));
        assertEq(splitter.recipientClaimable(billId), TOTAL);
    }

    // =========================================================================
    // SECTION 5: refund
    // =========================================================================

    function test_Refund_HappyPath_PartialAfterDeadline() public {
        vm.prank(alice);
        splitter.payShare(billId);

        vm.warp(deadline + 1);

        uint256 splitterBefore = usdc.balanceOf(address(splitter));

        vm.expectEmit(true, false, false, false, address(splitter));
        emit JanusSplitter.BillRefunded(billId);

        vm.prank(creator);
        splitter.refund(billId);

        assertEq(uint8(_getBillStatus()), uint8(JanusSplitter.BillStatus.Refunded));
        // splitter still holds the funds — they're now claimable
        assertEq(usdc.balanceOf(address(splitter)), splitterBefore);
        assertEq(splitter.refundableBalance(billId, alice), ALICE_SHARE);
        // bob and carol paid nothing — no refund entry
        assertEq(splitter.refundableBalance(billId, bob), 0);
    }

    function test_Refund_RevertFullyPaid() public {
        _payAll();

        vm.warp(deadline + 1);

        vm.prank(creator);
        vm.expectRevert(JanusSplitter.CannotRefundFullyPaid.selector);
        splitter.refund(billId);
    }

    function test_Refund_RevertBeforeDeadline() public {
        vm.prank(alice);
        splitter.payShare(billId);

        vm.prank(creator);
        vm.expectRevert(JanusSplitter.RefundNotAllowed.selector);
        splitter.refund(billId);
    }

    function test_Refund_RevertNonCreator() public {
        vm.warp(deadline + 1);

        vm.prank(stranger);
        vm.expectRevert(JanusSplitter.NotBillCreator.selector);
        splitter.refund(billId);
    }

    function test_Refund_RevertBillNotOpen_AfterCancel() public {
        vm.prank(creator);
        splitter.cancel(billId);

        vm.warp(deadline + 1);

        vm.prank(creator);
        vm.expectRevert(JanusSplitter.BillNotOpen.selector);
        splitter.refund(billId);
    }

    // =========================================================================
    // SECTION 6: claimRefund
    // =========================================================================

    function test_ClaimRefund_HappyPath() public {
        vm.prank(alice);
        splitter.payShare(billId);

        vm.warp(deadline + 1);

        vm.prank(creator);
        splitter.refund(billId);

        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.expectEmit(true, true, false, true, address(splitter));
        emit JanusSplitter.RefundClaimed(billId, alice, ALICE_SHARE);

        vm.prank(alice);
        splitter.claimRefund(billId);

        assertEq(usdc.balanceOf(alice), aliceBefore + ALICE_SHARE);
        assertEq(splitter.refundableBalance(billId, alice), 0);
    }

    function test_ClaimRefund_RevertNoRefundAvailable() public {
        // Bob never paid
        vm.prank(bob);
        vm.expectRevert(JanusSplitter.NoRefundAvailable.selector);
        splitter.claimRefund(billId);
    }

    function test_ClaimRefund_RevertDoubleClaimAfterRefund() public {
        vm.prank(alice);
        splitter.payShare(billId);

        vm.warp(deadline + 1);
        vm.prank(creator);
        splitter.refund(billId);

        vm.prank(alice);
        splitter.claimRefund(billId);

        // Second claim should revert
        vm.prank(alice);
        vm.expectRevert(JanusSplitter.NoRefundAvailable.selector);
        splitter.claimRefund(billId);
    }

    // =========================================================================
    // SECTION 7: claimSettlement
    // =========================================================================

    function test_ClaimSettlement_HappyPath() public {
        _payAll();

        // Force tryTransfer to fail → recipientClaimable path
        usdc.setFailTransfers(true);

        vm.prank(stranger);
        splitter.settle(billId);

        assertEq(splitter.recipientClaimable(billId), TOTAL);

        // Now restore transfers so claimSettlement can actually move funds
        usdc.setFailTransfers(false);

        uint256 recipientBefore = usdc.balanceOf(recipient);

        vm.expectEmit(true, true, false, true, address(splitter));
        emit JanusSplitter.SettlementClaimed(billId, recipient, TOTAL);

        vm.prank(recipient);
        splitter.claimSettlement(billId);

        assertEq(usdc.balanceOf(recipient), recipientBefore + TOTAL);
        assertEq(splitter.recipientClaimable(billId), 0);
    }

    function test_ClaimSettlement_RevertWrongCaller() public {
        _payAll();
        usdc.setFailTransfers(true);
        splitter.settle(billId);
        usdc.setFailTransfers(false);

        vm.prank(stranger);
        vm.expectRevert(JanusSplitter.NotRecipient.selector);
        splitter.claimSettlement(billId);
    }

    function test_ClaimSettlement_RevertNothingToClaim() public {
        // Bill exists but nothing in recipientClaimable
        vm.prank(recipient);
        vm.expectRevert(JanusSplitter.NoSettlementToClaim.selector);
        splitter.claimSettlement(billId);
    }

    // =========================================================================
    // SECTION 8: cancel
    // =========================================================================

    function test_Cancel_HappyPath() public {
        vm.expectEmit(true, false, false, false, address(splitter));
        emit JanusSplitter.BillCancelled(billId);

        vm.prank(creator);
        splitter.cancel(billId);

        assertEq(uint8(_getBillStatus()), uint8(JanusSplitter.BillStatus.Cancelled));
    }

    function test_Cancel_RevertIfPaymentsExist() public {
        vm.prank(alice);
        splitter.payShare(billId);

        vm.prank(creator);
        vm.expectRevert(JanusSplitter.CannotCancelAfterPayment.selector);
        splitter.cancel(billId);
    }

    function test_Cancel_RevertNonCreator() public {
        vm.prank(stranger);
        vm.expectRevert(JanusSplitter.NotBillCreator.selector);
        splitter.cancel(billId);
    }

    function test_Cancel_RevertNotOpen() public {
        vm.prank(creator);
        splitter.cancel(billId);

        vm.prank(creator);
        vm.expectRevert(JanusSplitter.BillNotOpen.selector);
        splitter.cancel(billId);
    }

    // =========================================================================
    // SECTION 9: finalizeAfterDeadline
    // =========================================================================

    function test_FinalizeAfterDeadline_FullyPaid_Settles() public {
        _payAll();
        vm.warp(deadline + 1);

        uint256 recipientBefore = usdc.balanceOf(recipient);

        vm.expectEmit(true, true, false, true, address(splitter));
        emit JanusSplitter.BillSettled(billId, recipient, TOTAL);

        splitter.finalizeAfterDeadline(billId);

        assertEq(uint8(_getBillStatus()), uint8(JanusSplitter.BillStatus.Settled));
        assertEq(usdc.balanceOf(recipient), recipientBefore + TOTAL);
    }

    function test_FinalizeAfterDeadline_Partial_Refunds() public {
        vm.prank(alice);
        splitter.payShare(billId);

        vm.warp(deadline + 1);

        vm.expectEmit(true, false, false, false, address(splitter));
        emit JanusSplitter.BillRefunded(billId);

        splitter.finalizeAfterDeadline(billId);

        assertEq(uint8(_getBillStatus()), uint8(JanusSplitter.BillStatus.Refunded));
        assertEq(splitter.refundableBalance(billId, alice), ALICE_SHARE);
        assertEq(splitter.refundableBalance(billId, bob), 0);
    }

    function test_FinalizeAfterDeadline_NoPay_Refunds_EmptyBalances() public {
        vm.warp(deadline + 1);

        splitter.finalizeAfterDeadline(billId);

        assertEq(uint8(_getBillStatus()), uint8(JanusSplitter.BillStatus.Refunded));
        assertEq(splitter.refundableBalance(billId, alice), 0);
        assertEq(splitter.refundableBalance(billId, bob), 0);
        assertEq(splitter.refundableBalance(billId, carol), 0);
    }

    function test_FinalizeAfterDeadline_RevertBeforeDeadline() public {
        vm.expectRevert(JanusSplitter.DeadlineNotReached.selector);
        splitter.finalizeAfterDeadline(billId);
    }

    function test_FinalizeAfterDeadline_RevertNotOpen() public {
        vm.prank(creator);
        splitter.cancel(billId);

        vm.warp(deadline + 1);

        vm.expectRevert(JanusSplitter.BillNotOpen.selector);
        splitter.finalizeAfterDeadline(billId);
    }

    function test_FinalizeAfterDeadline_TryTransferFails_RecipientClaimable() public {
        _payAll();
        vm.warp(deadline + 1);

        usdc.setFailTransfers(true);
        splitter.finalizeAfterDeadline(billId);
        usdc.setFailTransfers(false);

        assertEq(uint8(_getBillStatus()), uint8(JanusSplitter.BillStatus.Settled));
        assertEq(splitter.recipientClaimable(billId), TOTAL);
    }

    // =========================================================================
    // SECTION 10: Fuzz tests
    // =========================================================================

    /// @dev Fuzz: any set of valid shares sums correctly into totalAmount.
    function testFuzz_CreateBill_TotalAmountIsSum(uint96 s0, uint96 s1, uint96 s2) public {
        s0 = uint96(bound(s0, 1, 1_000_000e6));
        s1 = uint96(bound(s1, 1, 1_000_000e6));
        s2 = uint96(bound(s2, 1, 1_000_000e6));

        address[] memory participants = new address[](3);
        participants[0] = alice;
        participants[1] = bob;
        participants[2] = carol;

        uint256[] memory shares = new uint256[](3);
        shares[0] = s0;
        shares[1] = s1;
        shares[2] = s2;

        vm.prank(creator);
        uint256 id = splitter.createBill(recipient, shares, participants, bytes32(0), block.timestamp + 1 days);

        (, , uint256 total, , , , , , ) = splitter.getBill(id);
        assertEq(total, uint256(s0) + uint256(s1) + uint256(s2));
    }

    /// @dev Fuzz: after paying their share, the participant's token balance
    ///      decreases by exactly the share amount and amountPaid increases exactly.
    function testFuzz_PayShare_AccountingIsExact(uint96 shareAmt) public {
        shareAmt = uint96(bound(shareAmt, 1, 5_000e6));

        // create a fresh 1-person bill with fuzzed share
        address[] memory participants = new address[](1);
        participants[0] = alice;
        uint256[] memory shares = new uint256[](1);
        shares[0] = shareAmt;

        usdc.mint(alice, shareAmt); // ensure alice has enough

        vm.prank(creator);
        uint256 id = splitter.createBill(recipient, shares, participants, bytes32(0), block.timestamp + 1 days);

        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        splitter.payShare(id);

        assertEq(usdc.balanceOf(alice), aliceBefore - shareAmt);

        (, , , uint256 amountPaid, , , , , ) = splitter.getBill(id);
        assertEq(amountPaid, shareAmt);
    }

    /// @dev Fuzz: settle after full payment always pays out the exact total to recipient.
    function testFuzz_Settle_FullyPaid_PayoutEqualsTotal(uint96 s0, uint96 s1) public {
        s0 = uint96(bound(s0, 1, 5_000e6));
        s1 = uint96(bound(s1, 1, 5_000e6));

        address[] memory participants = new address[](2);
        participants[0] = alice;
        participants[1] = bob;
        uint256[] memory shares = new uint256[](2);
        shares[0] = s0;
        shares[1] = s1;

        usdc.mint(alice, s0);
        usdc.mint(bob, s1);
        vm.prank(alice); usdc.approve(address(splitter), type(uint256).max);
        vm.prank(bob);   usdc.approve(address(splitter), type(uint256).max);

        vm.prank(creator);
        uint256 id = splitter.createBill(recipient, shares, participants, bytes32(0), block.timestamp + 1 days);

        vm.prank(alice); splitter.payShare(id);
        vm.prank(bob);   splitter.payShare(id);

        uint256 recipientBefore = usdc.balanceOf(recipient);

        vm.prank(stranger);
        splitter.settle(id);

        assertEq(usdc.balanceOf(recipient), recipientBefore + uint256(s0) + uint256(s1));
    }

    /// @dev Fuzz: after a refund the sum of refundableBalances equals amountPaid at refund time.
    function testFuzz_Refund_RefundableBalancesEqualAmountPaid(bool alicePays, bool bobPays) public {
        if (alicePays) { vm.prank(alice); splitter.payShare(billId); }
        if (bobPays)   { vm.prank(bob);   splitter.payShare(billId); }

        vm.warp(deadline + 1);
        vm.prank(creator);
        splitter.refund(billId);

        uint256 expectedAlice = alicePays ? ALICE_SHARE : 0;
        uint256 expectedBob   = bobPays   ? BOB_SHARE   : 0;

        assertEq(splitter.refundableBalance(billId, alice), expectedAlice);
        assertEq(splitter.refundableBalance(billId, bob),   expectedBob);
        assertEq(splitter.refundableBalance(billId, carol), 0); // carol never paid
    }

    // =========================================================================
    // SECTION 11: getBill / view helpers
    // =========================================================================

    function test_GetBill_RevertBillNotFound_Zero() public {
        vm.expectRevert(abi.encodeWithSelector(JanusSplitter.BillNotFound.selector, 0));
        splitter.getBill(0);
    }

    function test_GetBill_RevertBillNotFound_TooHigh() public {
        vm.expectRevert(abi.encodeWithSelector(JanusSplitter.BillNotFound.selector, 999));
        splitter.getBill(999);
    }

    function test_HasParticipantPaid_FalseBeforePay() public view {
        assertFalse(splitter.hasParticipantPaid(billId, alice));
    }

    function test_HasParticipantPaid_TrueAfterPay() public {
        vm.prank(alice);
        splitter.payShare(billId);
        assertTrue(splitter.hasParticipantPaid(billId, alice));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant test contract
// ─────────────────────────────────────────────────────────────────────────────

contract JanusSplitterInvariantTest is Test {
    JanusSplitter internal splitter;
    MockERC20 internal usdc;
    SplitterHandler internal handler;

    function setUp() public {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        address deployer = makeAddr("inv_deployer");
        vm.prank(deployer);
        splitter = new JanusSplitter(address(usdc), deployer);

        handler = new SplitterHandler(splitter, usdc);
        targetContract(address(handler));
    }

    /// @dev INVARIANT: The splitter's USDC balance is always ≥ the sum of
    ///      all refundableBalances that are still outstanding (i.e. funds
    ///      deposited but not yet claimed back are fully covered by the
    ///      contract's balance).
    function invariant_ContractHoldsFundsForRefundables() public view {
        if (!handler.billCreated()) return;
        uint256 billId = handler.activeBillId();

        // Gather participants from the bill
        (, , , , , , , address[] memory participants, ) = splitter.getBill(billId);

        uint256 totalClaimable = splitter.recipientClaimable(billId);
        for (uint256 i = 0; i < participants.length; i++) {
            totalClaimable += splitter.refundableBalance(billId, participants[i]);
        }

        assertGe(usdc.balanceOf(address(splitter)), totalClaimable);
    }

    /// @dev INVARIANT: ghostDeposited (sum of all payShare calls) is always
    ///      ≥ the splitter's USDC balance (the contract never holds more than
    ///      was deposited into it — no inflation).
    function invariant_NoFundsCreatedFromThinAir() public view {
        assertGe(handler.ghostDeposited(), usdc.balanceOf(address(splitter)));
    }
}
