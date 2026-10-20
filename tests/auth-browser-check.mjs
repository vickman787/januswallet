import { installPrivyFixture } from './privy-browser-fixture.mjs'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

// Browser-only module interception. No development or production authentication bypass.
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
const page = await browser.newPage({ viewport: { width: 375, height: 812 } })
page.setDefaultTimeout(60000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
const address = '0x1111111111111111111111111111111111111111'
const other = '0x2222222222222222222222222222222222222222'
await page.addInitScript(({ address }) => {
  let account = address
  const listeners = new Map()
  window.ethereum = { isMetaMask: true, isConnected: () => true,
    on(event, listener) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener) },
    removeListener(event, listener) { listeners.get(event)?.delete(listener) },
    _switchAccount(value) { account = value; window.fixtureWallets?.([value]); for (const callback of listeners.get('accountsChanged') ?? []) callback([value]) },
    async request({ method }) {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account]
      if (method === 'eth_chainId') return '0x13b2'
      if (method === 'wallet_getPermissions' || method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts' }]
      if (method === 'personal_sign') {
        if (window.rejectSignature) throw Object.assign(new Error('User rejected the request.'), { code: 4001 })
        return `0x${'12'.repeat(65)}`
      }
      throw new Error(`Unexpected wallet call: ${method}`)
    },
  }
}, { address })
await installPrivyFixture(page, { address })
const rows = new Map()
const calls = []
let offline = false
await page.route('**/api/**', async route => {
  const request = route.request()
  const subject = request.headers().authorization?.replace('Bearer ', '')
  const path = new URL(request.url()).pathname
  calls.push({ path, subject })
  const reply = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
  if (offline) return reply(503, { error: 'Account storage is unavailable. Try again.' })
  const row = rows.get(subject) ?? { profile: null, wallets: [] }
  if (path === '/api/me') return reply(200, row)
  if (path === '/api/profile') {
    const body = request.postDataJSON()
    row.profile = { username: body.username, display_name: body.displayName }; rows.set(subject, row)
    return reply(200, { profile: row.profile })
  }
  if (path === '/api/wallet/challenge') {
    row.challenge = request.postDataJSON().address
    return reply(200, { id: 'test-challenge', message: 'Test-only JANUS ownership signature. No payment.' })
  }
  if (path === '/api/wallet/verify') {
    row.wallets = [{ address: row.challenge.toLowerCase(), chain_id: 5042 }]
    return reply(200, { verified: true })
  }
  return reply(404, {})
})
// Avoid live RPC/network activity. These tests never send transactions.
await page.route('https://rpc.mainnet.arc.io/**', route => route.abort())
await mkdir('artifacts/verification', { recursive: true })
try {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded', timeout: 180000 })
  assert.equal(await page.getByLabel('JANUS account').count(), 0, 'No separate sign-in card on landing')
  assert.equal(await page.getByRole('button', { name: 'Connect wallet', exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Sign in', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Get started', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel sign in' }).click()
  await page.getByRole('heading', { name: /Shared payments/ }).waitFor()
  await page.getByRole('button', { name: 'Get started' }).click()
  await page.getByRole('button', { name: 'Continue with email' }).click()
  await page.getByRole('region', { name: 'Wallet balance' }).waitFor()
  await page.getByRole('button', { name: 'Go to homepage' }).click()
  await page.getByRole('heading', { name: /Shared payments/ }).waitFor()
  await page.getByRole('button', { name: 'Open wallet' }).click()
  await page.getByRole('region', { name: 'Wallet balance' }).waitFor()
  await page.evaluate(() => window.fixtureWallets([]))
  await page.getByRole('heading', { name: 'Welcome to JANUS' }).waitFor()
  await page.getByRole('button', { name: 'Create JANUS wallet', exact: true }).click()
  await page.getByRole('region', { name: 'Wallet balance' }).waitFor()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Username', { exact: true }).fill('alice')
  await page.getByLabel('Display name', { exact: true }).fill('Alice')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await page.getByText('Profile saved.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Account settings' }).click()
  await page.getByRole('button', { name: 'Verify connected wallet', exact: true }).waitFor()
  await page.evaluate(() => { window.rejectSignature = true })
  await page.getByRole('button', { name: 'Verify connected wallet', exact: true }).click()
  await page.getByRole('status').filter({ hasText: /rejected/i }).waitFor()
  assert.equal(calls.filter(call => call.path === '/api/wallet/verify').length, 0)
  await page.evaluate(() => { window.rejectSignature = false })
  await page.getByRole('button', { name: 'Verify connected wallet', exact: true }).click()
  await page.getByText('Connected wallet verified for this account.', { exact: true }).waitFor()
  await page.screenshot({ path: 'artifacts/verification/account-mobile.png', fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
  await page.evaluate(({address,other}) => window.fixtureWallets([address,other]), {address,other})
  await page.getByLabel('Active payment wallet').selectOption(other)
  await page.getByRole('region', { name: 'Wallet balance' }).waitFor()
  await page.getByRole('button', { name: 'Account settings' }).click()
  await page.getByRole('button', { name: 'Verify connected wallet', exact: true }).waitFor()
  assert.equal(await page.getByText('Connected wallet verified for this account.', { exact: true }).count(), 0)
  const savedBeforeSwitch = calls.filter(call => call.path === '/api/profile').length
  await page.getByLabel('Username', { exact: true }).fill('stale_draft')
  await page.evaluate(() => { window.pauseNextToken = true })
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await page.waitForFunction(() => !!window.resolveFixtureToken)
  await page.evaluate(() => window.fixtureAuthSwitch('did:privy:bob'))
  await page.getByRole('heading', { name: 'Welcome to JANUS' }).waitFor()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  assert.equal(await page.getByLabel('Username', { exact: true }).inputValue(), '')
  assert.equal(await page.getByLabel('Display name', { exact: true }).inputValue(), '')
  await page.evaluate(async () => { window.resolveFixtureToken('did:privy:bob'); await new Promise(resolve => setTimeout(resolve,100)) })
  assert.equal(calls.filter(call => call.path === '/api/profile').length, savedBeforeSwitch)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('heading', { name: /Shared payments/ }).waitFor()
  assert.equal(await page.getByLabel('Username', { exact: true }).count(), 0)
  offline = true
  await page.getByRole('button', { name: 'Get started', exact: true }).click()
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Account storage is unavailable' }).waitFor()
  offline = false
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  assert.equal(await page.getByLabel('Username', { exact: true }).inputValue(), 'alice')
  assert.deepEqual(errors, [])
  await writeFile('artifacts/verification/account-browser-result.json', JSON.stringify({ status: 'passed', errors,
    mode: 'Mock Privy SDK/API; real installed Privy wagmi adapter; injected fixture wallets; no live login or transactions' }, null, 2))
  console.log('Unified account browser checks passed: one entry, cancel, email/Google entry, profile save, Privy wallet bridge, signature rejection, wallet selection, account isolation, delayed-token race, sign-out and retry.')
} catch (error) {
  await page.screenshot({ path: 'artifacts/verification/account-failure.png', fullPage: true })
  throw error
} finally { await browser.close() }