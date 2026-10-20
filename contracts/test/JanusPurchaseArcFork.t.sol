// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {JanusPurchase} from "../JanusPurchase.sol";

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

/// @notice Run with Arc Foundry and --fork-url for a real Arc network.
contract JanusPurchaseArcForkTest is Test {
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    address internal organizer = makeAddr("organizer");
    address internal contributor = makeAddr("contributor");
    address internal recipient = makeAddr("recipient");

    function _isArc() private view returns (bool) {
        return block.chainid == 5042 || block.chainid == 5042002;
    }

    function testFork_RealArcUsdcContributionAndRelease() public {
        if (!_isArc()) return;
        assertGt(ARC_USDC.code.length, 0, "missing Arc USDC code");
        assertEq(IERC20Decimals(ARC_USDC).decimals(), 6, "unexpected Arc USDC decimals");

        JanusPurchase janus = new JanusPurchase();
        uint256 target = 5e6;
        vm.prank(organizer);
        bytes32 purchaseId =
            janus.createPurchase(recipient, target, uint40(block.timestamp + 1 days), uint40(block.timestamp + 2 days));

        vm.deal(contributor, 20e18);
        uint256 contributorBefore = IERC20(ARC_USDC).balanceOf(contributor);
        uint256 recipientBefore = IERC20(ARC_USDC).balanceOf(recipient);
        vm.startPrank(contributor);
        IERC20(ARC_USDC).approve(address(janus), target);
        janus.contribute(purchaseId, target);
        vm.stopPrank();

        vm.prank(organizer);
        janus.release(purchaseId);
        assertEq(IERC20(ARC_USDC).balanceOf(contributor), contributorBefore - target, "contribution mismatch");
        assertEq(IERC20(ARC_USDC).balanceOf(recipient), recipientBefore + target, "release mismatch");
        assertEq(IERC20(ARC_USDC).balanceOf(address(janus)), 0, "escrow not emptied");
    }

    function testFork_RealArcUsdcCancellationRefund() public {
        if (!_isArc()) return;
        JanusPurchase janus = new JanusPurchase();
        uint256 contribution = 2e6;
        vm.prank(organizer);
        bytes32 purchaseId =
            janus.createPurchase(recipient, 5e6, uint40(block.timestamp + 1 days), uint40(block.timestamp + 2 days));

        vm.deal(contributor, 20e18);
        uint256 contributorBefore = IERC20(ARC_USDC).balanceOf(contributor);
        vm.startPrank(contributor);
        IERC20(ARC_USDC).approve(address(janus), contribution);
        janus.contribute(purchaseId, contribution);
        vm.stopPrank();

        vm.prank(organizer);
        janus.cancel(purchaseId);
        vm.prank(contributor);
        janus.claimRefund(purchaseId);
        assertEq(IERC20(ARC_USDC).balanceOf(contributor), contributorBefore, "refund mismatch");
        assertEq(IERC20(ARC_USDC).balanceOf(address(janus)), 0, "refund escrow not emptied");
    }
}
