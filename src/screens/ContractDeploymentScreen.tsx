import { useState } from 'react'
import { encodeDeployData, formatEther, isAddress, keccak256, type Address, type Hash } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi'
import { JANUS_PURCHASE_ABI } from '../contracts'
import { JANUS_PURCHASE_BYTECODE } from '../abi/janusPurchaseBytecode'
import { ARC_USDC_ADDRESS } from '../lib/network'

type DeploymentNetwork = 'testnet' | 'mainnet'

export default function ContractDeploymentScreen({ onClose, network = 'testnet' }: {
  onClose: () => void
  network?: DeploymentNetwork
}) {
  const mainnet = network === 'mainnet'
  const targetChain = mainnet ? arc : arcTestnet
  const explorer = mainnet ? 'https://explorer.arc.io' : 'https://explorer.testnet.arc.io'
  const { address, chainId } = useAccount()
  const { data: wallet } = useWalletClient()
  const client = usePublicClient({ chainId: targetChain.id })
  const { switchChainAsync } = useSwitchChain()
  const [gas, setGas] = useState<bigint>()
  const [maxFee, setMaxFee] = useState<bigint>()
  const [balance, setBalance] = useState<bigint>()
  const [confirmation, setConfirmation] = useState('')
  const [hash, setHash] = useState<Hash>()
  const [contract, setContract] = useState<Address>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bytecodeHash = keccak256(JANUS_PURCHASE_BYTECODE)

  async function review() {
    if (!address || !client) return
    setBusy(true); setError('')
    try {
      const [estimate, fees, signerBalance] = await Promise.all([
        client.estimateGas({ account: address, data: encodeDeployData({ abi: JANUS_PURCHASE_ABI, bytecode: JANUS_PURCHASE_BYTECODE }) }),
        client.estimateFeesPerGas(),
        client.getBalance({ address }),
      ])
      setGas(estimate)
      setMaxFee(fees.maxFeePerGas)
      setBalance(signerBalance)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not estimate the deployment.')
    } finally { setBusy(false) }
  }

  async function deploy() {
    if (!address || !wallet || !client || !gas || (mainnet && confirmation !== 'DEPLOY MAINNET')) return
    setBusy(true); setError('')
    try {
      if (chainId !== targetChain.id) await switchChainAsync({ chainId: targetChain.id })
      const submitted = await wallet.deployContract({
        account: address,
        abi: JANUS_PURCHASE_ABI,
        bytecode: JANUS_PURCHASE_BYTECODE,
        chain: targetChain,
      })
      setHash(submitted)
      const receipt = await client.waitForTransactionReceipt({ hash: submitted, timeout: 90_000 })
      if (receipt.status !== 'success' || !receipt.contractAddress || !isAddress(receipt.contractAddress)) {
        throw new Error('Deployment did not produce a confirmed contract address.')
      }
      const configuredUsdc = await client.readContract({
        address: receipt.contractAddress,
        abi: JANUS_PURCHASE_ABI,
        functionName: 'ARC_USDC',
      })
      if (typeof configuredUsdc !== 'string' || configuredUsdc.toLowerCase() !== ARC_USDC_ADDRESS?.toLowerCase()) {
        throw new Error('Deployed contract reports an unexpected USDC address.')
      }
      setContract(receipt.contractAddress)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Deployment failed or was cancelled.')
    } finally { setBusy(false) }
  }

  const estimatedMaximum = gas && maxFee ? formatEther(gas * maxFee) : undefined

  return <main className="min-h-dvh bg-[#0B0D12] text-[#F1F3F2] p-4 sm:p-8">
    <section className="janus-panel max-w-xl mx-auto p-5 sm:p-7 space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-[#8992A3]">Local development tool</p>
        <h1 className="display text-2xl font-semibold mt-2">Deploy JanusPurchase</h1>
      </div>
      {mainnet
        ? <p className="text-sm text-amber-300">Arc Mainnet deployment creates an immutable contract for real USDC. The contract is not upgradeable and has no administrator withdrawal function.</p>
        : <p className="text-sm text-[#A8B0BE]">Arc Testnet deployment for contract validation. This tool is unavailable in production builds.</p>}
      <dl className="space-y-2 text-sm">
        <div><dt className="text-[#8992A3]">Signer</dt><dd className="mono break-all">{address ?? 'Create or connect a Privy wallet first.'}</dd></div>
        <div><dt className="text-[#8992A3]">Network</dt><dd>{targetChain.name}, chain {targetChain.id}</dd></div>
        <div><dt className="text-[#8992A3]">Canonical USDC</dt><dd className="mono break-all">{ARC_USDC_ADDRESS}</dd></div>
        <div><dt className="text-[#8992A3]">Constructor</dt><dd>None</dd></div>
        <div><dt className="text-[#8992A3]">Creation bytecode hash</dt><dd className="mono break-all">{bytecodeHash}</dd></div>
      </dl>
      {!mainnet && <a className="inline-block text-[#9BAEFF] underline" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">Fund this address with Arc Testnet USDC</a>}
      {!gas && <button className="janus-primary w-full" disabled={!address || busy} onClick={() => { void review() }}>{busy ? 'Estimating…' : `Review ${mainnet ? 'Mainnet ' : ''}deployment`}</button>}
      {gas !== undefined && !contract && <section className="rounded-xl border border-[#4D6BFF]/50 p-4 space-y-3">
        <h2 className="font-semibold">Deployment review</h2>
        <p className="text-sm text-[#C8CDD6]">Signer balance: {balance === undefined ? 'Loading…' : `${formatEther(balance)} native USDC`}.</p>
        <p className="text-sm text-[#C8CDD6]">Estimated gas limit: {gas.toString()}.{estimatedMaximum ? ` Estimated maximum network fee: ${estimatedMaximum} native USDC.` : ''} Your wallet shows the final fee before signing.</p>
        {mainnet && <label className="field-label">Type DEPLOY MAINNET to enable submission
          <input className="janus-input mono" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} />
        </label>}
        <button className="janus-primary w-full" disabled={busy || (mainnet && confirmation !== 'DEPLOY MAINNET')} onClick={() => { void deploy() }}>
          {busy ? 'Waiting for wallet or Arc…' : `Deploy on ${targetChain.name}`}
        </button>
      </section>}
      {hash && <a className="block text-[#9BAEFF] underline break-all" href={`${explorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer">View deployment transaction</a>}
      {contract && <div className="rounded-xl border border-green-400/40 p-4 space-y-3">
        <p className="text-green-300 font-semibold">Deployment confirmed</p>
        <a className="block text-[#9BAEFF] underline break-all" href={`${explorer}/address/${contract}`} target="_blank" rel="noopener noreferrer">{contract}</a>
        {mainnet
          ? <p className="text-sm text-[#C8CDD6]">Copy this address so JANUS can verify it and enable shared purchases on Mainnet.</p>
          : <a className="janus-primary block w-full text-center" href="?test-contract=janus-purchase">Test shared purchases</a>}
      </div>}
      {error && <p role="alert" className="text-amber-300 break-words">{error}</p>}
      <button className="janus-secondary w-full" disabled={busy} onClick={onClose}>Return to JANUS</button>
    </section>
  </main>
}
