/**
 * Zerion activity feed hook.
 * Fetches decoded wallet transactions from the local proxy.
 */
// oxlint-disable react/set-state-in-effect -- loading/async state in useEffect is unavoidable for network hooks
import { useState, useEffect } from 'react'

export interface ZerionTx {
  id: string
  attributes?: {
    operation_type?: string
    status?: string
    mined_at?: string
    sent_from?: string
    sent_to?: string
    transfers?: Array<{
      fungible_info?: { symbol?: string }
      quantity?: { float?: number }
      direction?: string
    }>
  }
}

export interface ActivityState {
  transactions: ZerionTx[]
  loading: boolean
  mock: boolean
}

export function useActivity(address: string | undefined): ActivityState {
  const [state, setState] = useState<ActivityState>({ transactions: [], loading: false, mock: false })

  useEffect(() => {
    if (!address) return
    setState(s => ({ ...s, loading: true }))
    fetch(`/api/activity?address=${address}`)
      .then(r => r.json() as Promise<{ transactions: ZerionTx[]; mock?: boolean }>)
      .then((data) => {
        setState({ transactions: data.transactions ?? [], loading: false, mock: data.mock ?? false })
      })
      .catch(() => {
        setState({ transactions: [], loading: false, mock: true })
      })
  }, [address])

  return state
}
