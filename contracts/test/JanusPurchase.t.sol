// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {JanusPurchase} from "../JanusPurchase.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// ===========================================================================
// Handler for invariant testing
// ===========================================================================
contract JanusHandler is Test {
    JanusPurchase public janus;
    MockERC20 public usdc;

    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    // Track every purchase + every contributor so we can sum refunds.
    bytes32[] public purchaseIds;
    // purchaseId => deduplicated contributor list
    mapping(bytes32 => address[]) public contributorLists;
    // purchaseId => contributor => already recorded
    mapping(bytes32 => mapping(address => bool)) internal _contributorSeen;

    address[] internal actors;

    constructor(JanusPurchase _janus, MockERC20 _usdc) {
        janus = _janus;
        usdc = _usdc;
        actors.push(makeAddr("actor0"));
        actors.push(makeAddr("actor1"));
        actors.push(makeAddr("actor2"));
        for (uint256 i; i < actors.length; i++) {
            usdc.mint(actors[i], 1_000_000e6);
            vm.prank(actors[i]);
            MockERC20(USDC_ADDR).approve(address(janus), type(uint256).max);
        }
    }

    function createPurchase(uint256 actorSeed, uint256 targetSeed, uint40 fDelay, uint40 rExtra) public {
        address organizer = actors[actorSeed % actors.length];
        uint256 target = bound(targetSeed, 1e6, 100_000e6);
        uint40 fd = uint40(block.timestamp) + uint40(bound(uint256(fDelay), 1, 30 days));
        uint40 rd = fd + uint40(bound(uint256(rExtra), 1, 30 days));

        vm.prank(organizer);
        bytes32 pid = janus.createPurchase(makeAddr("recipient"), target, fd, rd);
        purchaseIds.push(pid);
    }

    function contribute(uint256 pidSeed, uint256 actorSeed, uint256 amountSeed) public {
        if (purchaseIds.length == 0) return;
        bytes32 pid = purchaseIds[pidSeed % purchaseIds.length];

        (
            ,,,
            uint256 target,
            uint256 total,
            uint40 fd,,
            JanusPurchase.Status status
        ) = janus.getPurchase(pid);

        if (status != JanusPurchase.Status.Funding) return;
        if (block.timestamp >= fd) return;

        uint256 remaining = target - total;
        if (remaining == 0) return;

        address actor = actors[actorSeed % actors.length];
        uint256 amount = bound(amountSeed, 1, remaining);

        // Deduplicated contributor tracking
        if (!_contributorSeen[pid][actor]) {
            _contributorSeen[pid][actor] = true;
            contributorLists[pid].push(actor);
        }

        vm.prank(actor);
        janus.contribute(pid, amount);
    }

    function release(uint256 pidSeed) public {
        if (purchaseIds.length == 0) return;
        bytes32 pid = purchaseIds[pidSeed % purchaseIds.length];
        (
            address organizer,,,,, ,
            uint40 rd,
            JanusPurchase.Status status
        ) = janus.getPurchase(pid);
        if (status != JanusPurchase.Status.Funded) return;
        if (block.timestamp >= rd) return;
        vm.prank(organizer);
        janus.release(pid);
    }

    function cancel(uint256 pidSeed) public {
        if (purchaseIds.length == 0) return;
        bytes32 pid = purchaseIds[pidSeed % purchaseIds.length];
        (
            address organizer,,,,,,,
            JanusPurchase.Status status
        ) = janus.getPurchase(pid);
        if (status != JanusPurchase.Status.Funding && status != JanusPurchase.Status.Funded) return;
        vm.prank(organizer);
        janus.cancel(pid);
    }

    function markExpired(uint256 pidSeed) public {
        if (purchaseIds.length == 0) return;
        bytes32 pid = purchaseIds[pidSeed % purchaseIds.length];
        (
            ,,,,
            uint256 total,
            uint40 fd,
            uint40 rd,
            JanusPurchase.Status status
        ) = janus.getPurchase(pid);

        if (status == JanusPurchase.Status.Funding) {
            // Warp past the funding deadline if we haven't yet
            if (block.timestamp <= fd) vm.warp(uint256(fd) + 1);
            // If fully funded, the contract would normally flip to Funded status,
            // but since contribute() already handles that, skip if at target.
            (,,,uint256 tgt2, uint256 tot2,,,) = janus.getPurchase(pid);
            if (tot2 >= tgt2) return;
        } else if (status == JanusPurchase.Status.Funded) {
            if (block.timestamp <= rd) vm.warp(uint256(rd) + 1);
        } else {
            return;
        }
        // Suppress: if condition already not met the call will revert — that's ok
        try janus.markExpired(pid) {} catch {}

        // suppress unused var warning
        total;
    }

    function claimRefund(uint256 pidSeed, uint256 actorSeed) public {
        if (purchaseIds.length == 0) return;
        bytes32 pid = purchaseIds[pidSeed % purchaseIds.length];
        (,,,,,,, JanusPurchase.Status status) = janus.getPurchase(pid);
        if (status != JanusPurchase.Status.Cancelled && status != JanusPurchase.Status.Expired) return;
        address actor = actors[actorSeed % actors.length];
        vm.prank(actor);
        try janus.claimRefund(pid) {} catch {}
    }

    function getPurchaseIds() external view returns (bytes32[] memory) {
        return purchaseIds;
    }
    function getContributors(bytes32 pid) external view returns (address[] memory) {
        return contributorLists[pid];
    }
}

// ===========================================================================
// Main unit test contract
// ===========================================================================
contract JanusPurchaseTest is Test {
    JanusPurchase internal janus;
    MockERC20 internal usdc;

    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    address internal organizer = makeAddr("organizer");
    address internal recipient  = makeAddr("recipient");
    address internal alice      = makeAddr("alice");
    address internal bob        = makeAddr("bob");
    address internal carol      = makeAddr("carol");
    address internal stranger   = makeAddr("stranger");

    uint256 internal constant TARGET   = 1_000e6;   // 1 000 USDC (6 dp)
    uint40  internal constant F_DELTA  = 7 days;    // funding window
    uint40  internal constant R_DELTA  = 14 days;   // release window after funding deadline

    uint40  internal fDeadline;
    uint40  internal rDeadline;

    // -------------------------------------------------------------------------
    // setUp
    // -------------------------------------------------------------------------

    function setUp() public {
        // Pin block time so deadline arithmetic is deterministic
        vm.warp(1_700_000_000);

        fDeadline = uint40(block.timestamp) + F_DELTA;
        rDeadline = fDeadline + R_DELTA;

        janus = new JanusPurchase();

        // Etch the MockERC20 bytecode at the canonical USDC address
        MockERC20 mockDeploy = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(mockDeploy).code);
        usdc = MockERC20(USDC_ADDR);

        // Seed balances
        usdc.mint(alice,    10_000e6);
        usdc.mint(bob,      10_000e6);
        usdc.mint(carol,    10_000e6);
        usdc.mint(organizer, 10_000e6);

        // Approve janus to pull USDC
        vm.prank(alice);     usdc.approve(address(janus), type(uint256).max);
        vm.prank(bob);       usdc.approve(address(janus), type(uint256).max);
        vm.prank(carol);     usdc.approve(address(janus), type(uint256).max);
        vm.prank(organizer); usdc.approve(address(janus), type(uint256).max);
    }

    // -------------------------------------------------------------------------
    // helpers
    // -------------------------------------------------------------------------

    /// Creates a standard purchase as `organizer` and returns the purchaseId.
    function _createPurchase() internal returns (bytes32 pid) {
        vm.prank(organizer);
        pid = janus.createPurchase(recipient, TARGET, fDeadline, rDeadline);
    }

    /// Creates a purchase and fully funds it (alice contributes the whole target).
    function _createAndFund() internal returns (bytes32 pid) {
        pid = _createPurchase();
        vm.prank(alice);
        janus.contribute(pid, TARGET);
    }

    // =========================================================================
    // createPurchase
    // =========================================================================

    function test_CreatePurchase_HappyPath() public {
        vm.prank(organizer);
        bytes32 pid = janus.createPurchase(recipient, TARGET, fDeadline, rDeadline);

        (
            address org, address rec, address token,
            uint256 tgt, uint256 tot,
            uint40 fd, uint40 rd,
            JanusPurchase.Status status
        ) = janus.getPurchase(pid);

        assertEq(org,    organizer,  "organizer");
        assertEq(rec,    recipient,  "recipient");
        assertEq(token,  USDC_ADDR,  "usdcToken");
        assertEq(tgt,    TARGET,     "targetAmount");
        assertEq(tot,    0,          "totalContributed");
        assertEq(fd,     fDeadline,  "fundingDeadline");
        assertEq(rd,     rDeadline,  "releaseDeadline");
        assertEq(uint8(status), uint8(JanusPurchase.Status.Funding), "status");
    }

    function test_CreatePurchase_EmitsPurchaseCreated() public {
        // Predict the purchaseId: keccak256(abi.encode(organizer, 0))
        bytes32 expectedId = keccak256(abi.encode(organizer, uint256(0)));

        vm.prank(organizer);
        vm.expectEmit(true, true, true, true, address(janus));
        emit JanusPurchase.PurchaseCreated(expectedId, organizer, recipient, TARGET, fDeadline, rDeadline);
        janus.createPurchase(recipient, TARGET, fDeadline, rDeadline);
    }

    function test_CreatePurchase_NonceIncrementsPerOrganizer() public {
        bytes32 pid0 = keccak256(abi.encode(organizer, uint256(0)));
        bytes32 pid1 = keccak256(abi.encode(organizer, uint256(1)));

        vm.prank(organizer);
        bytes32 first = janus.createPurchase(recipient, TARGET, fDeadline, rDeadline);
        vm.prank(organizer);
        bytes32 second = janus.createPurchase(recipient, TARGET, fDeadline, rDeadline);

        assertEq(first,  pid0, "first id");
        assertEq(second, pid1, "second id");
        assertEq(janus.nextOrganizerNonce(organizer), 2, "nonce");
    }

    function test_CreatePurchase_RevertZeroRecipient() public {
        vm.prank(organizer);
        vm.expectRevert(JanusPurchase.InvalidRecipient.selector);
        janus.createPurchase(address(0), TARGET, fDeadline, rDeadline);
    }

    function test_CreatePurchase_RevertSelfRecipient() public {
        vm.prank(organizer);
        vm.expectRevert(JanusPurchase.InvalidRecipient.selector);
        janus.createPurchase(address(janus), TARGET, fDeadline, rDeadline);
    }

    function test_Release_RevertAtReleaseDeadline() public {
        bytes32 pid = _createAndFund();
        vm.warp(rDeadline);
        vm.prank(organizer);
        vm.expectRevert(abi.encodeWithSelector(JanusPurchase.ReleaseWindowExpired.selector, pid));
        janus.release(pid);
    }

    function test_MarkExpired_AtFundingDeadline() public {
        bytes32 pid = _createPurchase();
        vm.warp(fDeadline);
        janus.markExpired(pid);
        (,,,,,,,JanusPurchase.Status status) = janus.getPurchase(pid);
        assertEq(uint8(status), uint8(JanusPurchase.Status.Expired));
    }

    function test_MarkExpired_AtReleaseDeadline() public {
        bytes32 pid = _createAndFund();
        vm.warp(rDeadline);
        janus.markExpired(pid);
        (,,,,,,,JanusPurchase.Status status) = janus.getPurchase(pid);
        assertEq(uint8(status), uint8(JanusPurchase.Status.Expired));
    }
    function test_ClaimRefund_FailedTransferDoesNotBlockOtherContributorsOrRetry() public {
        bytes32 pid = _createPurchase();
        vm.prank(alice);
        janus.contribute(pid, TARGET / 2);
        vm.prank(bob);
        janus.contribute(pid, TARGET / 2);
        vm.prank(organizer);
        janus.cancel(pid);

        usdc.setFailTransfers(true);
        vm.prank(alice);
        vm.expectRevert();
        janus.claimRefund(pid);
        assertFalse(janus.isRefundClaimed(pid, alice));
        assertEq(janus.contributionOf(pid, alice), TARGET / 2);

        usdc.setFailTransfers(false);
        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        janus.claimRefund(pid);
        assertEq(usdc.balanceOf(bob) - bobBefore, TARGET / 2);
        assertFalse(janus.isRefundClaimed(pid, alice));

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        janus.claimRefund(pid);
        assertEq(usdc.balanceOf(alice) - aliceBefore, TARGET / 2);
        assertTrue(janus.isRefundClaimed(pid, alice));
        assertEq(usdc.balanceOf(address(janus)), 0);
    }

    function test_Release_FailedTransferPreservesCancellationAndRefundRecovery() public {
        bytes32 pid = _createAndFund();
        usdc.setFailTransfers(true);
        vm.prank(organizer);
        vm.expectRevert();
        janus.release(pid);
        (,,,,,,,JanusPurchase.Status status) = janus.getPurchase(pid);
        assertEq(uint8(status), uint8(JanusPurchase.Status.Funded));
        assertEq(usdc.balanceOf(address(janus)), TARGET);

        vm.prank(organizer);
        janus.cancel(pid);
        usdc.setFailTransfers(false);
        uint256 beforeRefund = usdc.balanceOf(alice);
        vm.prank(alice);
        janus.claimRefund(pid);
        assertEq(usdc.balanceOf(alice) - beforeRefund, TARGET);
    }

    function test_Cancel_BlocksReleaseAndNewContributions() public {
        bytes32 pid = _createAndFund();
        vm.prank(organizer);
        janus.cancel(pid);
        vm.prank(organizer);
        vm.expectRevert(abi.encodeWithSelector(JanusPurchase.InvalidStatus.selector,
            pid, JanusPurchase.Status.Cancelled, JanusPurchase.Status.Funded));
        janus.release(pid);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(JanusPurchase.InvalidStatus.selector,
            pid, JanusPurchase.Status.Cancelled, JanusPurchase.Status.Funding));
        janus.contribute(pid, 1);
    }
    function test_CreatePurchase_RevertZeroTarget() public {
        vm.prank(organizer);
        vm.expectRevert(JanusPurchase.InvalidTargetAmount.selector);
        janus.createPurchase(recipient, 0, fDeadline, rDeadline);
    }

    function test_CreatePurchase_RevertFundingDeadlineEqualToNow() public {
        // fundingDeadline == block.timestamp is not strictly future -> invalid
        uint40 pastDeadline = uint40(block.timestamp);
        vm.prank(organizer);
        vm.expectRevert(JanusPurchase.InvalidFundingDeadline.selector);
        janus.createPurchase(recipient, TARGET, pastDeadline, rDeadline);
    }

    function test_CreatePurchase_RevertFundingDeadlineInPast() public {
        uint40 pastDeadline = uint40(block.timestamp) - 1;
        vm.prank(organizer);
        vm.expectRevert(JanusPurchase.InvalidFundingDeadline.selector);
        janus.createPurchase(recipient, TARGET, pastDeadline, rDeadline);
    }

    function test_CreatePurchase_RevertReleaseDeadlineEqualToFunding() public {
        vm.prank(organizer);
        vm.expectRevert(JanusPurchase.InvalidReleaseDeadline.selector);
        janus.createPurchase(recipient, TARGET, fDeadline, fDeadline);
    }

    function test_CreatePurchase_RevertReleaseDeadlineBeforeFunding() public {
        vm.prank(organizer);
        vm.expectRevert(JanusPurchase.InvalidReleaseDeadline.selector);
        janus.createPurchase(recipient, TARGET, fDeadline, fDeadline - 1);
    }

    // The PurchaseAlreadyExists guard is structurally unreachable via normal API
    // (nonce increments after each success), so we only verify nonce behaviour.
    function test_CreatePurchase_NoncePreventsCollision() public {
        _createPurchase();
        assertEq(janus.nextOrganizerNonce(organizer), 1, "nonce after one create");
    }

    // =========================================================================
    // contribute
    // =========================================================================

    function test_Contribute_HappyPath() public {
        bytes32 pid = _createPurchase();
        uint256 amount = 100e6;

        vm.prank(alice);
        janus.contribute(pid, amount);

        (,,,,uint256 tot,,,) = janus.getPurchase(pid);
        assertEq(tot, amount, "totalContributed after one contribution");
        assertEq(janus.contributionOf(pid, alice), amount, "alice contribution tracked");
    }

    function test_Contribute_EmitsContributed() public {
        bytes32 pid = _createPurchase();
        uint256 amount = 200e6;

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(janus));
        emit JanusPurchase.Contributed(pid, alice, amount, amount);
        janus.contribute(pid, amount);
    }

    function test_Contribute_ExactCapReachesFunded() public {
        bytes32 pid = _createPurchase();

        vm.prank(alice);
        janus.contribute(pid, 600e6);

        vm.prank(bob);
        vm.expectEmit(true, false, false, true, address(janus));
        emit JanusPurchase.PurchaseFunded(pid, TARGET);
        janus.contribute(pid, 400e6);

        (,,,,,,,JanusPurchase.Status status) = janus.getPurchase(pid);
        assertEq(uint8(status), uint8(JanusPurchase.Status.Funded), "status Funded");
    }

    function test_Contribute_OverfundingReverts() public {
        bytes32 pid = _createPurchase();

        vm.prank(alice);
        janus.contribute(pid, 900e6);

        vm.prank(bob);
        uint256 overAmount = 200e6; // 900 + 200 = 1100 > 1000
        vm.expectRevert(
            abi.encodeWithSelector(
                JanusPurchase.Overfunding.selector,
                pid,
                900e6 + overAmount,
                TARGET
            )
        );
        janus.contribute(pid, overAmount);
    }

    function test_Contribute_RevertAtFundingDeadline() public {
        bytes32 pid = _createPurchase();
        vm.warp(uint256(fDeadline)); // block.timestamp == fDeadline -> closed

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(JanusPurchase.FundingClosed.selector, pid));
        janus.contribute(pid, 100e6);
    }

    function test_Contribute_RevertAfterFundingDeadline() public {
        bytes32 pid = _createPurchase();
        vm.warp(uint256(fDeadline) + 1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(JanusPurchase.FundingClosed.selector, pid));
        janus.contribute(pid, 100e6);
    }

    function test_Contribute_RevertWrongStatus_Funded() public {
        bytes32 pid = _createAndFund(); // status = Funded

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                JanusPurchase.InvalidStatus.selector,
                pid,
                JanusPurchase.Status.Funded,
                JanusPurchase.Status.Funding
            )
        );
        janus.contribute(pid, 1e6);
    }

    function test_Contribute_RevertZeroAmount() public {
        bytes32 pid = _createPurchase();

        vm.prank(alice);
        vm.expectRevert(JanusPurchase.InvalidAmount.selector);
        janus.contribute(pid, 0);
    }

    function test_Contribute_PullsTokensFromContributor() public {
        bytes32 pid = _createPurchase();
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 janusBefore = usdc.balanceOf(address(janus));

        vm.prank(alice);
        janus.contribute(pid, 300e6);

        assertEq(usdc.balanceOf(alice),          aliceBefore - 300e6, "alice balance decreased");
        assertEq(usdc.balanceOf(address(janus)),  janusBefore + 300e6, "janus balance increased");
    }

    // =========================================================================
    // release
    // =========================================================================

    function test_Release_HappyPath() public {
        bytes32 pid = _createAndFund();
        uint256 recipientBefore = usdc.balanceOf(recipient);

        vm.prank(organizer);
        janus.release(pid);

        assertEq(usdc.balanceOf(recipient), recipientBefore + TARGET, "recipient received funds");

        (,,,,,,,JanusPurchase.Status status) = janus.getPurchase(pid);
        assertEq(uint8(status), uint8(JanusPurchase.Status.Released), "status Released");
    }

    function test_Release_EmitsReleased() public {
        bytes32 pid = _createAndFund();

        vm.prank(organizer);
        vm.expectEmit(true, true, false, true, address(janus));
        emit JanusPurchase.Released(pid, recipient, TARGET);
        janus.release(pid);
    }

    function test_Release_RevertUnderfunded() public {
        bytes32 pid = _createPurchase(); // still Funding

        vm.prank(organizer);
        vm.expectRevert(
            abi.encodeWithSelector(
                JanusPurchase.InvalidStatus.selector,
                pid,
                JanusPurchase.Status.Funding,
                JanusPurchase.Status.Funded
            )
        );
        janus.release(pid);
    }

    function test_Release_RevertWrongCaller() public {
        bytes32 pid = _createAndFund();

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(JanusPurchase.Unauthorized.selector, pid, stranger)
        );
        janus.release(pid);
    }

    function test_Release_RevertPastReleaseDeadline() public {
        bytes32 pid = _createAndFund();
        vm.warp(uint256(rDeadline) + 1);

        vm.prank(organizer);
        vm.expectRevert(abi.encodeWithSelector(JanusPurchase.ReleaseWindowExpired.selector, pid));
        janus.release(pid);
    }

    function test_Release_RevertDoubleRelease() public {
        bytes32 pid = _createAndFund();

        vm.prank(organizer);
        janus.release(pid);

        vm.prank(organizer);
        vm.expectRevert(
            abi.encodeWithSelector(
                JanusPurchase.InvalidStatus.selector,
                pid,
                JanusPurchase.Status.Released,
                JanusPurchase.Status.Funded
            )
        );
        janus.release(pid);
    }

    // =========================================================================
    // cancel
    // =========================================================================

    function test_Cancel_OrganizerCancelsFunding() public {
        bytes32 pid = _createPurchase();

        vm.prank(organizer);
        janus.cancel(pid);

        (,,,,,,,JanusPurchase.Status status) = janus.getPurchase(pid);
        assertEq(uint8(status), uint8(JanusPurchase.Status.Cancelled), "status Cancelled");
    }

    function test_Cancel_OrganizerCancelsFunded() public {
        bytes32 pid = _createAndFund();

        vm.prank(organizer);
        janus.cancel(pid);

        (,,,,,,,JanusPurchase.Status status) = janus.getPurchase(pid);
        assertEq(uint8(status), uint8(JanusPurchase.Status.Cancelled), "status Cancelled");
    }

    function test_Cancel_EmitsCancelled() public {
        bytes32 pid = _createPurchase();

        vm.prank(organizer);
        vm.expectEmit(true, false, false, false, address(janus));
        emit JanusPurchase.Cancelled(pid);
        janus.cancel(pid);
    }

    function test_Cancel_RevertNonOrganizer() public {
        bytes32 pid = _createPurchase();

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(JanusPurchase.Unauthorized.selector, pid, stranger)
        );
        janus.cancel(pid);
    }

    function test_Cancel_RevertAlreadyReleased() public {
        bytes32 pid = _createAndFund();

        vm.prank(organizer);
        janus.release(pid);

        vm.prank(organizer);
        vm.expectRevert(
            abi.encodeWithSelector(
                JanusPurchase.InvalidStatus.selector,
                pid,
                JanusPurchase.Status.Released,
                JanusPurchase.Status.Funding
            )
        );
        janus.cancel(pid);
    }

    function test_Cancel_RevertAlreadyCancelled() public {
        bytes32 pid = _createPurchase();

        vm.prank(organizer);
        janus.cancel(pid);

        vm.prank(organizer);
        vm.expectRevert(
            abi.encodeWithSelector(
                JanusPurchase.InvalidStatus.selector,
                pid,
                JanusPurchase.Status.Cancelled,
                JanusPurchase.Status.Funding
            )
        );
        janus.cancel(pid);
    }

    // =========================================================================
    // markExpired
    // =========================================================================

    function test_MarkExpired_UnderfundedPastFundingDeadline() public {
        bytes32 pid = _createPurchase();

        vm.prank(alice);
        janus.contribute(pid, 500e6);

        vm.warp(uint256(fDeadline) + 1);

        vm.expectEmit(true, false, false, false, address(janus));
        emit JanusPurchase.Expired(pid);
        janus.markExpired(pid);

        (,,,,,,,JanusPurchase.Status status) = janus.getPurchase(pid);
        assertEq(uint8(status), uint8(JanusPurchase.Status.Expired), "status Expired");
    }

    function test_MarkExpired_FundedPastReleaseDeadline() public {
        bytes32 pid = _createAndFund();
        vm.warp(uint256(rDeadline) + 1);

        vm.expectEmit(true, false, false, false, address(janus));
        emit JanusPurchase.Expired(pid);
        janus.markExpired(pid);

        (,,,,,,,JanusPurchase.Status status) = janus.getPurchase(pid);
        assertEq(uint8(status), uint8(JanusPurchase.Status.Expired), "status Expired");
    }

    function test_MarkExpired_RevertTooEarlyFunding() public {
        bytes32 pid = _createPurchase();
        // still within funding window
        vm.expectRevert(abi.encodeWithSelector(JanusPurchase.NotExpired.selector, pid));
        janus.markExpired(pid);
    }

    function test_MarkExpired_RevertTooEarlyFunded() public {
        bytes32 pid = _createAndFund();
        // still within release window
        vm.expectRevert(abi.encodeWithSelector(JanusPurchase.NotExpired.selector, pid));
        janus.markExpired(pid);
    }

    function test_MarkExpired_RevertAlreadyReleased() public {
        bytes32 pid = _createAndFund();

        vm.prank(organizer);
        janus.release(pid);

        vm.warp(uint256(rDeadline) + 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                JanusPurchase.InvalidStatus.selector,
                pid,
                JanusPurchase.Status.Released,
                JanusPurchase.Status.Funding
            )
        );
        janus.markExpired(pid);
    }

    function test_MarkExpired_RevertAlreadyCancelled() public {
        bytes32 pid = _createPurchase();

        vm.prank(organizer);
        janus.cancel(pid);

        vm.warp(uint256(fDeadline) + 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                JanusPurchase.InvalidStatus.selector,
                pid,
                JanusPurchase.Status.Cancelled,
                JanusPurchase.Status.Funding
            )
        );
        janus.markExpired(pid);
    }

    function test_MarkExpired_RevertFundedWithinReleaseWindow() public {
        bytes32 pid = _createAndFund();
        // Still inside release window -> revert NotExpired
        vm.expectRevert(abi.encodeWithSelector(JanusPurchase.NotExpired.selector, pid));
        janus.markExpired(pid);
    }

    // =========================================================================
    // claimRefund
    // =========================================================================

    function test_ClaimRefund_AfterCancel() public {
        bytes32 pid = _createPurchase();

        vm.prank(alice);
        janus.contribute(pid, 300e6);
        vm.prank(bob);
        janus.contribute(pid, 200e6);

        vm.prank(organizer);
        janus.cancel(pid);

        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        janus.claimRefund(pid);

        assertEq(usdc.balanceOf(alice), aliceBefore + 300e6, "alice refunded");
        assertTrue(janus.isRefundClaimed(pid, alice), "refund flagged");
    }

    function test_ClaimRefund_AfterExpire() public {
        bytes32 pid = _createPurchase();

        vm.prank(alice);
        janus.contribute(pid, 400e6);

        vm.warp(uint256(fDeadline) + 1);
        janus.markExpired(pid);

        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        janus.claimRefund(pid);

        assertEq(usdc.balanceOf(alice), aliceBefore + 400e6, "alice refunded after expire");
    }

    function test_ClaimRefund_EmitsRefundClaimed() public {
        bytes32 pid = _createPurchase();

        vm.prank(alice);
        janus.contribute(pid, 300e6);

        vm.prank(organizer);
        janus.cancel(pid);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true, address(janus));
        emit JanusPurchase.RefundClaimed(pid, alice, 300e6);
        janus.claimRefund(pid);
    }

    function test_ClaimRefund_DoubleClaim_Reverts() public {
        bytes32 pid = _createPurchase();

        vm.prank(alice);
        janus.contribute(pid, 300e6);

        vm.prank(organizer);
        janus.cancel(pid);

        vm.prank(alice);
        janus.claimRefund(pid);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(JanusPurchase.RefundAlreadyClaimed.selector, pid, alice)
        );
        janus.claimRefund(pid);
    }

    function test_ClaimRefund_ZeroContribution_Reverts() public {
        bytes32 pid = _createPurchase();

        vm.prank(organizer);
        janus.cancel(pid);

        // stranger never contributed
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(JanusPurchase.RefundUnavailable.selector, pid, stranger)
        );
        janus.claimRefund(pid);
    }

    function test_ClaimRefund_WrongStatus_Reverts() public {
        bytes32 pid = _createAndFund(); // status = Funded

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(JanusPurchase.RefundUnavailable.selector, pid, alice)
        );
        janus.claimRefund(pid);
    }

    function test_ClaimRefund_MultipleContributors() public {
        bytes32 pid = _createPurchase();

        vm.prank(alice); janus.contribute(pid, 300e6);
        vm.prank(bob);   janus.contribute(pid, 200e6);
        vm.prank(carol); janus.contribute(pid, 100e6);

        vm.prank(organizer);
        janus.cancel(pid);

        uint256 aB = usdc.balanceOf(alice);
        uint256 bB = usdc.balanceOf(bob);
        uint256 cB = usdc.balanceOf(carol);

        vm.prank(alice); janus.claimRefund(pid);
        vm.prank(bob);   janus.claimRefund(pid);
        vm.prank(carol); janus.claimRefund(pid);

        assertEq(usdc.balanceOf(alice), aB + 300e6, "alice");
        assertEq(usdc.balanceOf(bob),   bB + 200e6, "bob");
        assertEq(usdc.balanceOf(carol), cB + 100e6, "carol");
    }

    // =========================================================================
    // getPurchase / view helpers
    // =========================================================================

    function test_GetPurchase_RevertNotFound() public {
        vm.expectRevert(
            abi.encodeWithSelector(JanusPurchase.PurchaseNotFound.selector, bytes32(0))
        );
        janus.getPurchase(bytes32(0));
    }

    function test_ContributionOf_RevertNotFound() public {
        vm.expectRevert(
            abi.encodeWithSelector(JanusPurchase.PurchaseNotFound.selector, bytes32(0))
        );
        janus.contributionOf(bytes32(0), alice);
    }

    function test_IsRefundClaimed_RevertNotFound() public {
        vm.expectRevert(
            abi.encodeWithSelector(JanusPurchase.PurchaseNotFound.selector, bytes32(0))
        );
        janus.isRefundClaimed(bytes32(0), alice);
    }

    // =========================================================================
    // Fuzz: contribution amounts summing exactly to target
    // =========================================================================

    /// Three contributors whose amounts sum exactly to target.
    /// Verifies the Funded transition fires at the exact cap.
    function testFuzz_ContributionsExactlyHitTarget(uint256 a1, uint256 a2) public {
        // a1 in [1, TARGET-2] so a2 can be at least 1 and a3 at least 1
        a1 = bound(a1, 1, TARGET - 2);
        a2 = bound(a2, 1, TARGET - a1 - 1);
        uint256 a3 = TARGET - a1 - a2;

        bytes32 pid = _createPurchase();

        vm.prank(alice); janus.contribute(pid, a1);
        vm.prank(bob);   janus.contribute(pid, a2);

        // Final contribution should trigger PurchaseFunded
        vm.prank(carol);
        vm.expectEmit(true, false, false, true, address(janus));
        emit JanusPurchase.PurchaseFunded(pid, TARGET);
        janus.contribute(pid, a3);

        (,,,,uint256 tot,,,JanusPurchase.Status status) = janus.getPurchase(pid);
        assertEq(tot, TARGET, "totalContributed == target");
        assertEq(uint8(status), uint8(JanusPurchase.Status.Funded), "status Funded");
    }

    /// Refund amounts always match contributed amounts after a cancel.
    function testFuzz_RefundMatchesContribution(uint256 amount) public {
        amount = bound(amount, 1e6, TARGET);

        bytes32 pid = _createPurchase();
        vm.prank(alice);
        janus.contribute(pid, amount);

        vm.prank(organizer);
        janus.cancel(pid);

        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        janus.claimRefund(pid);

        assertEq(usdc.balanceOf(alice) - aliceBefore, amount, "refund == contribution");
    }

    /// Organizer can release any fully-funded amount within the release window.
    function testFuzz_ReleaseAmountMatchesTarget(uint256 target) public {
        // Bound target to alice's available balance (10_000e6 minted in setUp)
        target = bound(target, 1e6, 10_000e6);

        bytes32 pid;
        vm.prank(organizer);
        pid = janus.createPurchase(recipient, target, fDeadline, rDeadline);

        vm.prank(alice);
        janus.contribute(pid, target);

        uint256 recipientBefore = usdc.balanceOf(recipient);

        vm.prank(organizer);
        janus.release(pid);

        assertEq(usdc.balanceOf(recipient) - recipientBefore, target, "recipient got exact target");
    }
}

// ===========================================================================
// Invariant test (separate contract so forge targets it correctly)
// ===========================================================================
contract JanusPurchaseInvariantTest is Test {
    JanusPurchase internal janus;
    MockERC20 internal usdc;
    JanusHandler internal handler;

    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;

    function setUp() public {
        vm.warp(1_700_000_000);

        janus = new JanusPurchase();

        MockERC20 mockDeploy = new MockERC20("Mock USDC", "mUSDC", 6);
        vm.etch(USDC_ADDR, address(mockDeploy).code);
        usdc = MockERC20(USDC_ADDR);

        handler = new JanusHandler(janus, usdc);

        // The handler constructor already mints USDC for its actors at USDC_ADDR
        // and sets approvals. Nothing else needed here.

        targetContract(address(handler));
    }

    /// For every purchase in Cancelled or Expired state, the sum of all
    /// contributor balances recorded in the handler must never exceed
    /// totalContributed. This ensures the contract can always honour every refund.
    function invariant_RefundableNeverExceedsTotalContributed() public view {
        bytes32[] memory ids = handler.getPurchaseIds();
        for (uint256 i; i < ids.length; i++) {
            bytes32 pid = ids[i];
            (,,,,uint256 tot,,,JanusPurchase.Status status) = janus.getPurchase(pid);

            if (status != JanusPurchase.Status.Cancelled && status != JanusPurchase.Status.Expired) {
                continue;
            }

            address[] memory contributors = handler.getContributors(pid);
            uint256 sumClaimable;
            for (uint256 j; j < contributors.length; j++) {
                address c = contributors[j];
                if (!janus.isRefundClaimed(pid, c)) {
                    sumClaimable += janus.contributionOf(pid, c);
                }
            }
            assertLe(sumClaimable, tot, "sum of claimable refunds <= totalContributed");
        }
    }

    /// The contract's USDC balance must always be >= the sum of all funds
    /// still held in escrow (Funding/Funded purchases) plus unclaimed refunds
    /// (Cancelled/Expired purchases).
    function invariant_ContractBalanceCoversEscrow() public view {
        bytes32[] memory ids = handler.getPurchaseIds();
        uint256 escrow;
        for (uint256 i; i < ids.length; i++) {
            bytes32 pid = ids[i];
            (,,,,uint256 tot,,,JanusPurchase.Status status) = janus.getPurchase(pid);

            if (
                status == JanusPurchase.Status.Funding ||
                status == JanusPurchase.Status.Funded
            ) {
                // All contributed tokens are still sitting in the contract
                escrow += tot;
            } else if (
                status == JanusPurchase.Status.Cancelled ||
                status == JanusPurchase.Status.Expired
            ) {
                // Only the unclaimed portion remains in the contract
                address[] memory contributors = handler.getContributors(pid);
                for (uint256 j; j < contributors.length; j++) {
                    address c = contributors[j];
                    if (!janus.isRefundClaimed(pid, c)) {
                        escrow += janus.contributionOf(pid, c);
                    }
                }
            }
            // Released: tokens have left the contract — do not count
        }
        assertGe(usdc.balanceOf(address(janus)), escrow, "contract balance >= escrow");
    }
}
