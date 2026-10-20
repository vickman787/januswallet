import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseUsdcInput, paymentRecipient, splitUsdc, hasExpectedTransfer } from '../src/lib/payments.ts'
import { mergeTransfers, loadTransferPage, type TransferEntry } from '../src/lib/activity.ts'
import { encodeEventTopics, encodeAbiParameters, erc20Abi, type PublicClient, type Log } from 'viem'

const wallet = '0x1111111111111111111111111111111111111111' as const
const other = '0x2222222222222222222222222222222222222222' as const
const hash = `0x${'ab'.repeat(32)}` as const

test('USDC inputs preserve every base unit and reject silent rounding', () => {
  assert.equal(parseUsdcInput('12.345678'), 12345678n)
  assert.equal(parseUsdcInput(' 0.000001 '), 1n)
  for (const input of ['0', '-1', '1e3', '1.0000001', 'Infinity', 'NaN', '', '1,000', '0x10']) {
    assert.throws(() => parseUsdcInput(input), input)
  }
  assert.throws(() => parseUsdcInput((2n ** 256n).toString()))
})

test('recipients are normalized and zero/invalid destinations are rejected', () => {
  assert.equal(paymentRecipient(` ${wallet} `), wallet)
  assert.throws(() => paymentRecipient('0x0000000000000000000000000000000000000000'))
  assert.throws(() => paymentRecipient('@alice'))
})

test('split rounding sums exactly and rejects zero-share/overprecision cases', () => {
  assert.deepEqual(splitUsdc(1000000n, 3), [333334n, 333333n, 333333n])
  for (let count = 1; count <= 100; count++) {
    for (const total of [BigInt(count), 1000001n, 1234567890123456789n]) {
      const shares = splitUsdc(total, count)
      assert.equal(shares.reduce((sum, share) => sum + share, 0n), total)
      assert.ok(shares.every(share => share > 0n))
      assert.ok(shares[0] - shares[shares.length - 1] <= 1n)
    }
  }
  for (const count of [0, -1, 1.5, 1001, NaN]) assert.throws(() => splitUsdc(100n, count))
  assert.throws(() => splitUsdc(1n, 2))
})

test('transfer indexing deduplicates log identifiers, not whole transactions', () => {
  const entry: TransferEntry = { id: `5042:${hash}:1`, hash, logIndex: 1, blockNumber: 5n,
    from: wallet, to: other, amount: 1n, direction: 'sent' }
  const next = { ...entry, id: `5042:${hash}:2`, logIndex: 2 }
  assert.deepEqual(mergeTransfers([entry, next, entry]), [next, entry])
})

test('chain reader bounds pages, filters both wallet directions, handles self-transfer once', async () => {
  const calls: Array<{ args: { from?: string; to?: string }; fromBlock: bigint; toBlock: bigint }> = []
  const log = { removed: false, blockNumber: 9999n, logIndex: 1, transactionHash: hash,
    args: { from: wallet, to: wallet, value: 42n } }
  const client = {
    getBlockNumber: async () => 10000n,
    getContractEvents: async (request: typeof calls[number]) => { calls.push(request); return [log] },
  } as unknown as PublicClient
  const page = await loadTransferPage(client, other, wallet)
  assert.equal(page.fromBlock, 8001n)
  assert.equal(page.toBlock, 10000n)
  assert.equal(page.nextBlock, 8000n)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].args.from, wallet)
  assert.equal(calls[1].args.to, wallet)
  assert.equal(page.entries.length, 1)
  assert.equal(page.entries[0].direction, 'self')
  const finalPage = await loadTransferPage(client, other, wallet, 100n)
  assert.equal(finalPage.fromBlock, 0n)
  assert.equal(finalPage.nextBlock, undefined)
})

test('chain reader errors stay errors instead of becoming an empty successful history', async () => {
  const client = { getBlockNumber: async () => { throw new Error('RPC unavailable') } } as unknown as PublicClient
  await assert.rejects(loadTransferPage(client, other, wallet), /RPC unavailable/)
})

import { readPendingTransfer, savePendingTransfer, clearPendingTransfer } from '../src/lib/pending-transfer.ts'

test('pending receipt recovery is isolated per account and rejects corrupt payloads', () => {
  const records = new Map<string, string>()
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value),
    removeItem: (key: string) => records.delete(key),
  } })
  const transfer = { hash, account: wallet, to: other, amount: '1234567', input: '1.234567' }
  assert.equal(savePendingTransfer(transfer), true)
  assert.deepEqual(readPendingTransfer(wallet), transfer)
  assert.equal(readPendingTransfer(other), undefined)
  records.set(`janus:pending-transfer:5042:${wallet}`, JSON.stringify({ ...transfer, amount: '999' }))
  assert.equal(readPendingTransfer(wallet), undefined)
  clearPendingTransfer(wallet)
  assert.equal(readPendingTransfer(wallet), undefined)
})

test('receipt validation requires the exact token, sender, recipient and amount', () => {
  const log = {
    address: other,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: wallet, to: other } }),
    data: encodeAbiParameters([{ type: 'uint256' }], [42n]),
    blockHash: hash, blockNumber: 10n, transactionHash: hash, transactionIndex: 0, logIndex: 0, removed: false,
  } as Log
  assert.equal(hasExpectedTransfer([log], other, wallet, other, 42n), true)
  assert.equal(hasExpectedTransfer([log], other, wallet, other, 43n), false)
  assert.equal(hasExpectedTransfer([log], wallet, wallet, other, 42n), false)
  assert.equal(hasExpectedTransfer([log], other, other, wallet, 42n), false)
  assert.equal(hasExpectedTransfer([], other, wallet, other, 42n), false)
})
