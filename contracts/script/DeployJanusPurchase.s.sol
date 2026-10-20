// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {JanusPurchase} from "../JanusPurchase.sol";

interface IERC20MetadataLite {
    function decimals() external view returns (uint8);
}

/// @notice Deploys JanusPurchase only on Arc Testnet or Arc Mainnet.
/// @dev Run with Arc Foundry. The signer is selected by forge script flags;
///      no private key is read by this source file.
contract DeployJanusPurchase is Script {
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    uint256 internal constant ARC_MAINNET_CHAIN_ID = 5042;
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5042002;

    error UnsupportedChain(uint256 chainId);
    error MissingArcUsdcCode();
    error UnexpectedArcUsdcDecimals(uint8 decimals);
    error DeploymentVerificationFailed();

    function run() external returns (JanusPurchase deployed) {
        if (block.chainid != ARC_MAINNET_CHAIN_ID && block.chainid != ARC_TESTNET_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }
        if (ARC_USDC.code.length == 0) revert MissingArcUsdcCode();

        uint8 decimals = IERC20MetadataLite(ARC_USDC).decimals();
        if (decimals != 6) revert UnexpectedArcUsdcDecimals(decimals);

        vm.startBroadcast();
        deployed = new JanusPurchase();
        vm.stopBroadcast();

        if (address(deployed).code.length == 0 || deployed.ARC_USDC() != ARC_USDC) {
            revert DeploymentVerificationFailed();
        }
    }
}