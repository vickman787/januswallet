/**
 * Pre-flight Tenderly simulation hook.
 * Calls the local API server before the user signs a transaction.
 */

export interface SimulateParams {
  from: string
  to: string
  data?: string
  value?: string
}

export interface SimulateResult {
  success: boolean
  gasUsed: number
  error: string | null
  mock: boolean
}

export async function simulateTx(params: SimulateParams): Promise<SimulateResult> {
  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      return { success: false, gasUsed: 0, error: `Server error ${res.status}`, mock: false }
    }
    return (await res.json()) as SimulateResult
  } catch (err: unknown) {
    // Network error — treat as non-blocking (let the tx proceed with a warning)
    const msg = err instanceof Error ? err.message : 'Simulation unavailable'
    return { success: true, gasUsed: 0, error: msg, mock: true }
  }
}
