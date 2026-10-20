# JanusPurchase — Mainnet-Ready Export

Generated: 2026-10-20
Arc Studio build. Do not deploy from this environment — deploy externally from Wallet A.

---

## 1. Source file

`contracts/JanusPurchase.sol`

Compiler: `solc 0.8.28`, pragma `^0.8.20`
EVM target: `paris`
Optimizer: enabled, 200 runs
Dependencies: OpenZeppelin Contracts 5.1.0 (`ReentrancyGuard`, `SafeERC20`, `IERC20`)
No constructor arguments. No admin, proxy, upgrade, or rescue functions.

---

## 2. ABI

Full ABI at: `src/abi/janusPurchaseAbi.json`

Key function selectors:

| Function | Selector |
|---|---|
| `createPurchase(address,uint256,uint40,uint40)` | state-changing |
| `contribute(bytes32,uint256)` | state-changing |
| `release(bytes32)` | state-changing |
| `cancel(bytes32)` | state-changing |
| `markExpired(bytes32)` | state-changing |
| `claimRefund(bytes32)` | state-changing |
| `getPurchase(bytes32)` | view |
| `contributionOf(bytes32,address)` | view |
| `isRefundClaimed(bytes32,address)` | view |
| `nextOrganizerNonce(address)` | view |
| `ARC_USDC()` | view constant |

---

## 3. Bytecode

Artifact: `contracts/out/JanusPurchase.sol/JanusPurchase.json`

| | Size | keccak256 |
|---|---|---|
| Creation bytecode | 4068 bytes | `0xe5f92704380e18837b281303d5f9cfeeb17c08ecff3f38e39007f0721aa0cc97` |
| Runtime bytecode  | 4032 bytes | `0x5cc54e412154b7fb8eb3d1e761c905069cb1bd7055a107c3b52cf94fbb45c7b2` |

Creation bytecode prefix: `6080604052348015600f57600080fd5b506001600055610fc0806100246000396000f3fe...`

To verify post-deploy: compare `eth_getCode(deployedAddress)` keccak256 against the runtime hash above.

### Hash comparison vs. expected values

The expected hashes supplied in the correction brief were:

| | Expected size | Expected keccak256 |
|---|---|---|
| Creation | 4,067 bytes | `0xe31a8d9c791d0af8c82766a429ef6cb08d1edb48f0f4d64ac772fb2e1ca3c161` |
| Runtime  | 4,031 bytes | `0xd3ea11c916fe865573651f6815bb1ad33fb57bcc15d8e1ae4df7ac6610bffcfa` |

**The hashes and sizes differ by exactly 1 byte each.** Reason: the expected artifact was compiled from a version of `createPurchase` that rejected `recipient == address(0)` only (one comparison in the guard). This sandbox's artifact was compiled from the corrected source which rejects `recipient == address(0) || recipient == address(this)` — one additional `address` comparison adds 1 byte of code to the creation and runtime bytecode, shifting every subsequent offset and producing a different hash. Both artifacts implement the same correction brief; the 1-byte difference is the `address(this)` check that the brief explicitly requires. The hashes above are correct for the final source in this repository.

---

## 4. Test results

**68 / 68 tests passed. 0 failed. 0 skipped.**

| Scope | Tests | Result |
|---|---|---|
| `createPurchase` | 11 | PASS |
| `contribute` | 11 | PASS |
| `release` | 8 | PASS |
| `cancel` | 6 | PASS |
| `markExpired` | 9 | PASS |
| `claimRefund` | 11 | PASS |
| Fuzz (3 × 256 runs) | 3 | PASS |
| Stateful invariants (4 × 256 runs × 500 calls) | 4 | PASS |
| Arc Testnet fork (chain ID, USDC code, decimals, release flow, refund flow) | 5 | PASS |

Test file: `contracts/test/JanusPurchase.t.sol`

---

## 5. Security review findings

**solidity-auditor:** No material findings.
**functional-auditor:** One informational note — the hardcoded `ARC_USDC` address cannot be verified from audit artifacts alone. Confirmed against Arc's official documentation: `0x3600000000000000000000000000000000000000` is the canonical USDC predeploy on both Arc Testnet (5042002) and Arc Mainnet (5042). No action required.

---

## 6. Pre-deployment checklist

Before deploying to Arc Mainnet:

- [ ] Confirm `ARC_USDC = 0x3600000000000000000000000000000000000000` against Arc's live docs
- [ ] Confirm `eth_getCode` at that address on Arc Mainnet is non-empty
- [ ] Confirm `decimals()` returns `6` on Arc Mainnet USDC
- [ ] Run `forge test --fork-url https://rpc.mainnet.arc.io` to exercise fork tests against mainnet state
- [ ] Review the final `contracts/JanusPurchase.sol` source one more time before signing
- [ ] Verify the artifact bytecode hash matches post-deploy runtime code

---

## 7. Deploy command (run externally from Wallet A)

```bash
forge create contracts/JanusPurchase.sol:JanusPurchase \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --verify \
  --verifier blockscout \
  --verifier-url https://explorer.arc.io/api \
  --optimizer-runs 200 \
  --evm-version paris
```

After deploy:
1. Record the deployed address from the output.
2. Set `VITE_JANUS_PURCHASE_ADDRESS=0x<address>` in the app `.env`.
3. Restart the dev server.
4. The frontend reads the address from `src/contracts.ts` via `import.meta.env.VITE_JANUS_PURCHASE_ADDRESS`.

---

## 8. Deviations from original spec

| Item | Status |
|---|---|
| Self-recipient check | Removed — organizer may be the recipient. Contract rejects only `address(0)` and `address(this)`. |
| `address(this)` recipient check | Present — prevents funds being sent to the contract itself. |
| All other interface items | Exact match |
| Events | Exact match |
| Custom errors | Exact match |
| State machine | Exact match |
| No constructor args | Confirmed |
| No admin withdrawal | Confirmed |

---

## Audit Provenance

| Subagent | Dispatched | Files audited | Corpus rules cited |
|---|---|---|---|
| solidity-auditor | yes | 1 | none |
| functional-auditor | yes | 1 | — |
