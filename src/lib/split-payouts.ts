/** Allocate recipient totals across equal payer shares without losing a USDC base unit. */
export function allocateSplitPayouts(recipientTotals: bigint[], shareCount: number): bigint[][] {
  if (!Number.isSafeInteger(shareCount) || shareCount < 1 || shareCount > 1000 ||
      recipientTotals.length < 1 || recipientTotals.length > 20 || recipientTotals.some(value => value <= 0n)) {
    throw new Error('Choose 1–20 recipients and 1–1000 payable shares.')
  }
  if (recipientTotals.some(value => value < BigInt(shareCount))) throw new Error('Every recipient must receive at least one USDC base unit from each share.')
  const total = recipientTotals.reduce((sum, value) => sum + value, 0n)
  if (total < BigInt(shareCount)) throw new Error('Each share must contain at least one USDC base unit.')
  const count = BigInt(shareCount)
  const rows = Array.from({ length: shareCount }, (_, index) => total / count + (BigInt(index) < total % count ? 1n : 0n))
  const remaining = [...rows]
  const matrix = rows.map(() => recipientTotals.map(() => 0n))
  let remainingTotal = total
  for (let column = 0; column < recipientTotals.length - 1; column++) {
    const target = recipientTotals[column]
    const floors = remaining.map(value => target * value / remainingTotal)
    let extra = target - floors.reduce((sum, value) => sum + value, 0n)
    const order = remaining.map((value, index) => ({ index, remainder: target * value % remainingTotal }))
      .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)
    for (const { index } of order) {
      if (extra === 0n) break
      if (floors[index] < remaining[index]) { floors[index]++; extra-- }
    }
    if (extra !== 0n) throw new Error('Unable to allocate recipient amounts.')
    floors.forEach((value, index) => { matrix[index][column] = value; remaining[index] -= value })
    remainingTotal -= target
  }
  remaining.forEach((value, index) => { matrix[index][recipientTotals.length - 1] = value })
  if (matrix.some(row => row.some(value => value === 0n))) throw new Error('The recipient amounts are too small to divide across every share.')
  return matrix
}
