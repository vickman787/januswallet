import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { ARC_MAINNET_ID } from '../contracts'
import { loadExplorerTransfers } from '../lib/activity'

export function useTransferActivity() {
  const { address } = useAccount()
  const query = useQuery({
    queryKey: ['usdc-activity', ARC_MAINNET_ID, address?.toLowerCase()],
    enabled: !!address,
    queryFn: ({ signal }) => loadExplorerTransfers(address!, signal),
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    retry: 1,
  })
  return { ...query, entries: query.data ?? [] }
}