import { installPrivyFixture } from './privy-browser-fixture.mjs'
import { chromium } from '@playwright/test'
import { decodeFunctionData, encodeFunctionResult, multicall3Abi, erc20Abi, encodeEventTopics } from 'viem'
import sharp from 'sharp'
import jsQR from 'jsqr'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const address = '0x1111111111111111111111111111111111111111'
const other = '0x2222222222222222222222222222222222222222'
const pendingHash = `0x${'ab'.repeat(32)}`
const token = '0x3600000000000000000000000000000000000000'
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
const page = await context.newPage()
page.setDefaultTimeout(60_000)
const errors = []
const rpcCalls = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(({ address }) => {
  const listeners = new Map()
  let account = address
  let authorized = false
  window.ethereum = {
    isMetaMask: true, isConnected: () => true,
    on(event, listener) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener) },
    removeListener(event, listener) { listeners.get(event)?.delete(listener) },
    _switchAccount(value) { account = value; window.fixtureWallets?.([value]); for (const listener of listeners.get('accountsChanged') ?? []) listener([value]) },
    async request({ method }) {
      if (method === 'eth_accounts') return authorized ? [account] : []
      if (method === 'eth_requestAccounts') { authorized = true; return [account] }
      if (method === 'eth_chainId') return '0x13b2'
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null
      if (method === 'wallet_getPermissions') return [{ parentCapability: 'eth_accounts' }]
      if (method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts' }]
      throw Object.assign(new Error('User rejected the request (mock provider).'), { code: 4001 })
    },
  }
}, { address })
await installPrivyFixture(page, { address })
await page.route(/^https:\/\/rpc\.mainnet\.arc\.io\/?/, async route => {
  const body = route.request().postDataJSON()
  const requests = Array.isArray(body) ? body : [body]
  const responses = requests.map(request => {
    rpcCalls.push(request.method)
    assert.ok(!['eth_sendRawTransaction', 'eth_sendTransaction'].includes(request.method), 'No transaction broadcast allowed')
    let result
    if (request.method === 'eth_chainId') result = '0x13b2'
    else if (request.method === 'eth_blockNumber') result = '0x2710'
    else if (request.method === 'eth_getLogs') result = []
    else if (request.method === 'eth_getTransactionReceipt') result = {
      transactionHash: pendingHash, transactionIndex: '0x0', blockHash: pendingHash, blockNumber: '0x2710',
      from: address, to: token, cumulativeGasUsed: '0x5208', gasUsed: '0x5208', contractAddress: null,
      logsBloom: `0x${'00'.repeat(256)}`, status: '0x1', effectiveGasPrice: '0x1', type: '0x2',
      logs: [{ address: token, blockHash: pendingHash, blockNumber: '0x2710', transactionHash: pendingHash,
        transactionIndex: '0x0', logIndex: '0x0', removed: false,
        topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: address, to: other } }),
        data: encodeFunctionResult({ abi: erc20Abi, functionName: 'balanceOf', result: 1000001n }) }],
    }
    else if (request.method === 'eth_call') {
      const calldata = request.params[0].data
      if (calldata.startsWith('0x82ad56cb')) {
        const decoded = decodeFunctionData({ abi: multicall3Abi, data: calldata })
        result = encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3',
          result: decoded.args[0].map(() => ({ success: true,
            returnData: encodeFunctionResult({ abi: erc20Abi, functionName: 'balanceOf', result: 100000000n }) })) })
      } else {
        result = calldata.startsWith('0x70a08231')
          ? encodeFunctionResult({ abi: erc20Abi, functionName: 'balanceOf', result: 100000000n })
          : encodeFunctionResult({ abi: erc20Abi, functionName: 'transfer', result: true })
      }
    } else if (request.method === 'eth_getBalance') result = '0x56bc75e2d63100000'
    else result = '0x1'
    return { jsonrpc: '2.0', id: request.id, result }
  })
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(Array.isArray(body) ? responses : responses[0]) })
})
try {
  await mkdir('artifacts/verification', { recursive: true })
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: /Shared payments/ }).waitFor()
  const logo = page.getByRole('img', { name: 'JANUS symbol' }).first()
  assert.ok(await logo.isVisible())
  await page.screenshot({ path: 'artifacts/verification/landing-mobile.png', fullPage: true })
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Landing overflow at ${width}`)
  }
  await page.setViewportSize({ width: 375, height: 812 })
  await page.getByRole('button', { name: 'Get started', exact: true }).click()
  await page.getByRole('dialog', { name: 'Privy sign in' }).waitFor()
  await page.getByRole('button', { name: 'Continue with wallet', exact: true }).click()
  await page.getByRole('region', { name: 'Wallet balance' }).waitFor()
  await page.getByText('100.00', { exact: false }).first().waitFor()
  await page.getByRole('button', { name: 'Receive', exact: true }).click()
  const receive = page.getByRole('dialog', { name: 'Receive USDC' })
  await receive.waitFor()
  assert.ok(await receive.evaluate(dialog => dialog.contains(document.activeElement)), 'Dialog owns keyboard focus')
  const qr = await receive.locator('figure svg').screenshot()
  const { data, info } = await sharp(qr).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data, address)
  await page.screenshot({ path: 'artifacts/verification/receive-mobile.png', fullPage: true })
  await page.keyboard.press('Escape')
  assert.equal(await receive.count(), 0)
  await page.getByRole('button', { name: 'Split', exact: true }).click()
  await page.getByLabel('Total USDC').fill('1')
  await page.getByLabel('Number of shares').fill('3')
  await page.getByRole('button', { name: 'Calculate shares' }).click()
  await page.getByText('0.333334 USDC', { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByLabel('Recipient wallet address').fill(other)
  await page.getByLabel('Amount (USDC)').fill('1.0000001')
  await page.getByRole('button', { name: 'Review payment' }).click()
  await page.getByRole('alert').filter({ hasText: '6 decimal places' }).waitFor()
  await page.getByLabel('Amount (USDC)').fill('1.000001')
  await page.getByRole('button', { name: 'Review payment' }).click()
  await page.getByText(other, { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Confirm payment' }).click()
  await page.getByRole('alert').filter({ hasText: 'cancelled' }).waitFor({ timeout: 15000 })
  assert.equal(await page.getByText('Payment confirmed', { exact: true }).count(), 0)
  await page.keyboard.press('Escape')
  await page.evaluate(({ address, other, pendingHash }) => {
    sessionStorage.setItem(`janus:pending-transfer:5042:${address}`, JSON.stringify({
      hash: pendingHash, account: address, to: other, amount: '1000001', input: '1.000001',
    }))
  }, { address, other, pendingHash })
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByRole('button', { name: 'Check confirmation' }).click()
  await page.getByText('Payment confirmed', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByRole('button', { name: 'Review payment' }).waitFor()
  assert.equal(await page.evaluate(address => sessionStorage.getItem(`janus:pending-transfer:5042:${address}`), address), null)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Activity', exact: true }).click()
  await page.getByText('Older transfers may still exist.', { exact: false }).waitFor()
  assert.ok(rpcCalls.includes('eth_getLogs'))
  await page.evaluate(other => window.ethereum._switchAccount(other), other)
  await page.getByRole('region', { name: 'Wallet balance' }).waitFor()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('heading', { name: /Shared payments/ }).waitFor()
  assert.equal(await page.getByRole('navigation', { name: 'Main navigation' }).count(), 0)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: 'artifacts/verification/landing-desktop.png', fullPage: true })
  assert.deepEqual(errors, [])
  await writeFile('artifacts/verification/browser-result.json', JSON.stringify({ status: 'passed', viewportWidths: [320, 375, 768, 1280], rpcCalls, errors, mode: 'Mocked wallet and RPC; no transaction broadcast' }, null, 2))
  console.log('Browser checks passed: responsive landing, logo, injected wallet, real QR decode, native dialog focus/Escape, split rounding, amount validation, rejected send, activity reads, account switch and logout. Wallet and RPC mocked; no broadcast.')
} catch (error) {
  await page.screenshot({ path: 'artifacts/verification/failure.png', fullPage: true })
  await writeFile('artifacts/verification/failure.html', await page.content())
  throw error
} finally { await browser.close() }
