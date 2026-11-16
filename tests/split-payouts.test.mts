import test from 'node:test'
import assert from 'node:assert/strict'
import { allocateSplitPayouts } from '../src/lib/split-payouts.ts'

for (const [totals, count] of [
  [[500000n, 500000n], 1],
  [[500000n, 500000n], 3],
  [[1000000n, 2000000n, 3000000n], 7],
  [[4n, 4n, 4n, 4n], 4],
  [[10n, 999990n], 10],
] as const) {
  test('split payout allocation keeps every share and recipient exact', () => {
    const matrix = allocateSplitPayouts([...totals], count)
    const total = totals.reduce((sum, value) => sum + value, 0n)
    assert.equal(matrix.length, count)
    assert.deepEqual(matrix.map(row => row.reduce((sum, value) => sum + value, 0n)),
      Array.from({ length: count }, (_, index) => total / BigInt(count) + (BigInt(index) < total % BigInt(count) ? 1n : 0n)))
    assert.deepEqual(totals.map((_, column) => matrix.reduce((sum, row) => sum + row[column], 0n)), [...totals])
    assert.ok(matrix.every(row => row.every(value => value >= 0n)))
  })
}

test('split payout allocation rejects impossible and oversized plans', () => {
  assert.throws(() => allocateSplitPayouts([1n, 1n], 3))
  assert.throws(() => allocateSplitPayouts([1n, 999999n], 10))
  assert.throws(() => allocateSplitPayouts([0n, 10n], 1))
  assert.throws(() => allocateSplitPayouts(Array(21).fill(1n), 1))
})
