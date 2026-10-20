import { http } from 'wagmi'
import { createConfig } from '@privy-io/wagmi'
import { arc, arcTestnet, mainnet } from 'viem/chains'

// Privy supplies connectors and owns the active wallet lifecycle.
export const config = createConfig({
  chains: [arc, arcTestnet, mainnet],
  transports: { [arc.id]: http(), [arcTestnet.id]: http(), [mainnet.id]: http() },
})
