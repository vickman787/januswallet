import { randomBytes, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAddress, type Address, type Hash, type Hex } from 'viem'
import { createSiweMessage } from 'viem/siwe'
import { ApiError, profileInput, walletAddress, type Store } from './core'
import type { ProductProfile, ProductStore } from './products'

type Dependencies = {
  origin: string
  store: Store
  products?: ProductStore
  verifyToken: (header: string | undefined) => Promise<string>
  verifyWallet: (message: string, signature: Hex, address: Hex) => Promise<boolean>
  verifyTransfer?: (hash: Hash, from: Address, to: Address, amount: bigint) => Promise<boolean>
  verifyPurchaseCreation?: (input: {
    chainId: number; contract: Address; hash: Hash; purchaseId: Hash; organizer: Address
    recipient: Address; target: bigint; fundingDeadline: number; releaseDeadline: number
  }) => Promise<boolean>
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const username = /^@?([a-z0-9_]{1,32})$/

function requiredText(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new ApiError(400, label + ' is invalid.')
  return value.trim()
}
function amountRaw(value: unknown) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,77}$/.test(value)) throw new ApiError(400, 'Amount is invalid.')
  return BigInt(value)
}
function divideShares(total: bigint, count: number) {
  if (!Number.isInteger(count) || count < 1 || count > 1000) throw new ApiError(400, 'Share count must be between 1 and 1000.')
  if (total < BigInt(count)) throw new ApiError(400, 'The total is too small for this number of shares.')
  const base = total / BigInt(count)
  const extra = Number(total % BigInt(count))
  return Array.from({ length: count }, (_, index) => (base + (index < extra ? 1n : 0n)).toString())
}
async function jsonBody(req: IncomingMessage) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new ApiError(415, 'JSON is required.')
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req as AsyncIterable<Uint8Array>) {
    size += chunk.length
    if (size > 8192) throw new ApiError(413, 'Request is too large.')
    chunks.push(Buffer.from(chunk))
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString())
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new ApiError(400, 'Invalid request.')
    return parsed as Record<string, unknown>
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(400, 'Invalid JSON request.')
  }
}

export function createHandler(deps: Dependencies) {
  const limits = new Map<string, { count: number; until: number }>()
  function limit(key: string, max: number) {
    const now = Date.now()
    for (const [stored, entry] of limits) if (entry.until <= now) limits.delete(stored)
    const entry = limits.get(key) ?? { count: 0, until: now + 60000 }
    if (++entry.count > max || (!limits.has(key) && limits.size >= 10000)) throw new ApiError(429, 'Too many requests. Try again in a minute.')
    limits.set(key, entry)
  }
  async function resolveProfile(value: unknown): Promise<{ profile: ProductProfile; address: string }> {
    if (!deps.products || typeof value !== 'string') throw new ApiError(400, 'Use a verified JANUS username or wallet address.')
    const input = value.trim()
    if (isAddress(input)) {
      const address = input.toLowerCase()
      const profile = await deps.products.profileByWallet(address)
      if (!profile) throw new ApiError(404, 'That wallet is not verified by a JANUS account.')
      return { profile, address }
    }
    const match = username.exec(input.toLowerCase())
    if (!match) throw new ApiError(400, 'Use a verified JANUS username or wallet address.')
    const [profile, publicProfile] = await Promise.all([
      deps.products.profileByUsername(match[1]),
      deps.store.publicProfile(match[1]),
    ])
    if (!profile || !publicProfile) throw new ApiError(404, 'Username not found or has no verified Arc wallet.')
    return { profile, address: publicProfile.address }
  }

  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const reply = (status: number, data: unknown) => { res.writeHead(status); res.end(JSON.stringify(data)) }
    try {
      limit('ip:' + req.socket.remoteAddress, 120)
      if (req.headers.origin && req.headers.origin !== deps.origin) throw new ApiError(403, 'Origin is not allowed.')
      const path = new URL(req.url ?? '/', deps.origin).pathname
      if (req.method === 'GET' && path === '/api/health') return reply(200, { status: 'ready' })

      const publicUser = /^\/api\/users\/([a-z0-9_]{1,32})$/.exec(path)
      if (req.method === 'GET' && publicUser) {
        const found = await deps.store.publicProfile(publicUser[1])
        if (!found) throw new ApiError(404, 'Username not found or has no verified Arc wallet.')
        return reply(200, { username: found.username, displayName: found.display_name, address: found.address, chainId: found.chain_id })
      }
      const publicSplit = /^\/api\/splits\/([0-9a-f-]{36})$/.exec(path)
      if (req.method === 'GET' && publicSplit) {
        if (!deps.products || !uuid.test(publicSplit[1])) throw new ApiError(404, 'Split not found.')
        const found = await deps.products.split(publicSplit[1])
        if (!found) throw new ApiError(404, 'Split not found.')
        return reply(200, {
          split: { id: found.split.id, recipient_address: found.split.recipient_address, kind: found.split.kind, total_raw: found.split.total_raw, share_count: found.split.share_count, title: found.split.title, description: found.split.description, chain_id: found.split.chain_id, status: found.split.status },
          shares: found.shares.map(item => ({ split_id: item.split_id, share_index: item.share_index, amount_raw: item.amount_raw, status: item.status })),
        })
      }

      if (req.method !== 'GET' && req.headers.origin !== deps.origin) throw new ApiError(403, 'Origin is required.')

      const subject = await deps.verifyToken(req.headers.authorization)
      limit('subject:' + subject, 60)
      const body = req.method === 'GET' ? {} : await jsonBody(req)
      const profile = await deps.store.profile(subject)

      if (req.method === 'GET' && path === '/api/me') {
        return reply(200, { profile, wallets: profile ? await deps.store.wallets(profile.id) : [] })
      }
      if (req.method === 'PUT' && path === '/api/profile') {
        return reply(200, { profile: await deps.store.saveProfile(subject, profileInput(body)) })
      }
      if (!profile) throw new ApiError(409, 'Save your profile first.')

      if (req.method === 'POST' && path === '/api/wallet/challenge') {
        limit('challenge:' + subject, 5)
        const address = walletAddress(body.address)
        const expires = new Date(Date.now() + 5 * 60000)
        const id = randomUUID()
        const message = createSiweMessage({
          address, chainId: 5042, domain: new URL(deps.origin).host, uri: deps.origin,
          version: '1', nonce: randomBytes(16).toString('hex'), issuedAt: new Date(), expirationTime: expires,
          statement: 'Verify this wallet for your JANUS account. This does not authorize a payment.', requestId: id,
        })
        await deps.store.challenge(subject, { id, message, address: address.toLowerCase(), expires_at: expires.toISOString() })
        return reply(200, { id, message })
      }
      if (req.method === 'POST' && path === '/api/wallet/verify') {
        if (typeof body.id !== 'string' || !uuid.test(body.id) || typeof body.signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(body.signature)) throw new ApiError(400, 'Invalid wallet proof.')
        const challenge = await deps.store.consume(subject, body.id)
        if (!challenge || Date.parse(challenge.expires_at) <= Date.now()) throw new ApiError(400, 'Verification expired or was already used. Start again.')
        const valid = await deps.verifyWallet(challenge.message, body.signature as Hex, walletAddress(challenge.address))
        if (!valid) throw new ApiError(400, 'The signature does not match this wallet.')
        await deps.store.associate(profile.id, challenge.address)
        return reply(200, { verified: true })
      }


      if (path === '/api/inbox' && req.method === 'GET') {
        if (!deps.products) throw new ApiError(503, 'Inbox service is not configured.')
        return reply(200, await deps.products.inbox(profile.id))
      }

      if (path === '/api/purchases' && req.method === 'POST') {
        if (!deps.products || !deps.verifyPurchaseCreation) throw new ApiError(503, 'Purchase invitation service is not configured.')
        const chainId = body.chainId
        if (chainId !== 5042 && chainId !== 5042002) throw new ApiError(400, 'Purchase network is invalid.')
        const contract = walletAddress(body.contract)
        const organizer = walletAddress(body.organizer)
        const recipient = walletAddress(body.recipient)
        const purchaseId = typeof body.onchainId === 'string' && /^0x[0-9a-fA-F]{64}$/.test(body.onchainId)
          ? body.onchainId as Hash : null
        const hash = typeof body.txHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(body.txHash)
          ? body.txHash as Hash : null
        if (!purchaseId || !hash) throw new ApiError(400, 'Purchase transaction details are invalid.')
        const target = amountRaw(body.targetRaw)
        if (typeof body.fundingDeadline !== 'number' || typeof body.releaseDeadline !== 'number' ||
          !Number.isSafeInteger(body.fundingDeadline) || !Number.isSafeInteger(body.releaseDeadline) ||
          body.fundingDeadline <= 0 || body.releaseDeadline <= body.fundingDeadline) {
          throw new ApiError(400, 'Purchase deadlines are invalid.')
        }
        const title = requiredText(body.title, 'Title', 120)
        const description = typeof body.description === 'string' && body.description.trim().length <= 500 ? body.description.trim() : ''
        if (!Array.isArray(body.participants) || body.participants.length < 1 || body.participants.length > 20) {
          throw new ApiError(400, 'Add 1 to 20 participants.')
        }
        const verifiedWallets = await deps.store.wallets(profile.id)
        if (!verifiedWallets.some(item => item.address === organizer.toLowerCase() && item.chain_id === 5042)) {
          throw new ApiError(403, 'Create the purchase with your verified JANUS wallet.')
        }
        const resolved = await Promise.all(body.participants.map(value => resolveProfile(value)))
        const memberIds = resolved.map(item => item.profile.id)
        if (memberIds.includes(profile.id)) throw new ApiError(409, 'Remove your own username or wallet from Participants.')
        if (new Set(memberIds).size !== memberIds.length) throw new ApiError(409, 'Each participant may be invited only once.')
        const valid = await deps.verifyPurchaseCreation({
          chainId, contract, hash, purchaseId, organizer, recipient, target,
          fundingDeadline: body.fundingDeadline, releaseDeadline: body.releaseDeadline,
        })
        if (!valid) throw new ApiError(400, 'The transaction does not contain this purchase creation on Arc.')
        const purchase = await deps.products.savePurchase(profile.id, {
          chainId, contract, onchainId: purchaseId, groupId: null, title, description, txHash: hash,
        }, resolved.map(item => item.profile))
        return reply(201, { purchase, invited: resolved.length })
      }
      const purchaseRead = /^\/api\/purchases\/([0-9a-f-]{36})\/read$/.exec(path)
      if (req.method === 'POST' && purchaseRead) {
        if (!deps.products || !uuid.test(purchaseRead[1])) throw new ApiError(404, 'Purchase invitation not found.')
        await deps.products.markPurchaseRead(purchaseRead[1], profile.id)
        return reply(200, { read: true })
      }
      if (path === '/api/groups' && req.method === 'GET') {
        if (!deps.products) throw new ApiError(503, 'Group service is not configured.')
        return reply(200, await deps.products.groupsFor(profile.id))
      }
      if (path === '/api/groups' && req.method === 'POST') {
        if (!deps.products) throw new ApiError(503, 'Group service is not configured.')
        const name = requiredText(body.name, 'Group name', 80)
        const description = typeof body.description === 'string' && body.description.trim().length <= 500 ? body.description.trim() : ''
        if (!Array.isArray(body.members) || body.members.length < 1 || body.members.length > 100) throw new ApiError(400, 'Add 1 to 100 members.')
        const resolved = await Promise.all(body.members.map(value => resolveProfile(value)))
        const memberIds = resolved.map(item => item.profile.id)
        if (memberIds.includes(profile.id)) throw new ApiError(409, 'You are already the group organizer. Remove your own username or wallet from Members.')
        if (new Set(memberIds).size !== memberIds.length) throw new ApiError(409, 'Each member may be added only once.')
        const created = await deps.products.createGroup(profile.id, name, description, resolved.map(item => item.profile))
        return reply(201, { group: created })
      }
      const groupMembership = /^\/api\/groups\/([0-9a-f-]{36})\/membership$/.exec(path)
      if (req.method === 'DELETE' && groupMembership) {
        if (!deps.products || !uuid.test(groupMembership[1])) throw new ApiError(404, 'Group not found.')
        const left = await deps.products.leaveGroup(groupMembership[1], profile.id)
        if (!left) throw new ApiError(409, 'Only an accepted group member can leave. Organizers must keep ownership of their group.')
        return reply(200, { left: true })
      }      const groupMembers = /^\/api\/groups\/([0-9a-f-]{36})\/members$/.exec(path)
      if (req.method === 'POST' && groupMembers) {
        if (!deps.products || !uuid.test(groupMembers[1])) throw new ApiError(404, 'Group not found.')
        if (!Array.isArray(body.members) || body.members.length < 1 || body.members.length > 100) throw new ApiError(400, 'Add 1 to 100 members.')
        const resolved = await Promise.all(body.members.map(value => resolveProfile(value)))
        const memberIds = resolved.map(item => item.profile.id)
        if (memberIds.includes(profile.id)) throw new ApiError(409, 'You are already the group organizer. Remove your own username or wallet from Members.')
        if (new Set(memberIds).size !== memberIds.length) throw new ApiError(409, 'Each member may be added only once.')
        const added = await deps.products.addGroupMembers(groupMembers[1], profile.id, resolved.map(item => item.profile))
        return reply(200, { added })
      }
      const groupMember = /^\/api\/groups\/([0-9a-f-]{36})\/members\/([0-9a-f-]{36})$/.exec(path)
      if (req.method === 'DELETE' && groupMember) {
        if (!deps.products || !uuid.test(groupMember[1]) || !uuid.test(groupMember[2])) throw new ApiError(404, 'Group member not found.')
        const removed = await deps.products.removeGroupMember(groupMember[1], profile.id, groupMember[2])
        if (!removed) throw new ApiError(404, 'Group member not found.')
        return reply(200, { removed: true })
      }      const groupResponse = /^\/api\/groups\/([0-9a-f-]{36})\/respond$/.exec(path)
      if (req.method === 'POST' && groupResponse) {
        if (!deps.products || !uuid.test(groupResponse[1])) throw new ApiError(404, 'Group invitation not found.')
        if (body.status !== 'accepted' && body.status !== 'declined') throw new ApiError(400, 'Choose whether to accept or decline this invitation.')
        const changed = await deps.products.respondGroup(groupResponse[1], profile.id, body.status)
        if (!changed) throw new ApiError(409, 'This group invitation is no longer pending.')
        return reply(200, { status: body.status })
      }

      if (path === '/api/wallets/resolve' && req.method === 'POST') {
        if (!deps.products || !Array.isArray(body.addresses) || body.addresses.length < 1 || body.addresses.length > 50) throw new ApiError(400, 'Add 1 to 50 wallet addresses.')
        const addresses = [...new Set(body.addresses.map(value => walletAddress(value).toLowerCase()))]
        const resolved = await Promise.all(addresses.map(async address => {
          const owner = await deps.products!.profileByWallet(address)
          return owner ? { address, username: owner.username, displayName: owner.display_name } : null
        }))
        return reply(200, { profiles: resolved.filter(item => item !== null) })
      }
      if (path === '/api/splits' && req.method === 'GET') {
        if (!deps.products) throw new ApiError(503, 'Split service is not configured.')
        const accessible = await deps.products.splitsFor(profile.id)
        const found = await Promise.all(accessible.map(item => deps.products!.split(item.id)))
        return reply(200, { splits: found.flatMap(item => item ? [{
          split: {
            id: item.split.id, kind: item.split.kind, title: item.split.title,
            description: item.split.description, total_raw: item.split.total_raw,
            share_count: item.split.share_count, status: item.split.status,
            created_at: item.split.created_at,
          },
          role: item.split.organizer_id === profile.id ? 'organizer' : 'participant',
          your_share_index: item.shares.find(entry => entry.profile_id === profile.id)?.share_index ?? null,
          shares: item.shares.map(entry => ({ share_index: entry.share_index, amount_raw: entry.amount_raw, status: entry.status })),
        }] : []) })
      }
      if (path === '/api/splits' && req.method === 'POST') {
        if (!deps.products) throw new ApiError(503, 'Split service is not configured.')
        const recipient = await resolveProfile(body.recipient)
        const kind = body.kind === 'open' ? 'open' : body.kind === 'named' ? 'named' : null
        if (!kind) throw new ApiError(400, 'Split type is invalid.')
        const total = amountRaw(body.totalRaw)
        const title = requiredText(body.title, 'Title', 120)
        const description = typeof body.description === 'string' && body.description.trim().length <= 500 ? body.description.trim() : ''
        let members: ProductProfile[] = []
        let participantCount: number
        if (kind === 'named') {
          if (!Array.isArray(body.participants) || body.participants.length < 1 || body.participants.length > 100) throw new ApiError(400, 'Add 1 to 100 participants.')
          const resolved = await Promise.all(body.participants.map(value => resolveProfile(value)))
          const addresses = resolved.map(item => item.address.toLowerCase())
          if (new Set(addresses).size !== addresses.length) throw new ApiError(409, 'Each participant must resolve to a different wallet.')
          members = resolved.map(item => item.profile)
          if (members.some(member => member.id === profile.id)) throw new ApiError(409, 'The organizer is already included. Remove your own username or wallet from Participants.')
          participantCount = members.length
        } else {
          if (typeof body.shareCount !== 'number') throw new ApiError(400, 'Share count is invalid.')
          participantCount = body.shareCount
        }
        const includeOrganizer = kind === 'named' && body.includeOrganizer !== false
        const recipientIsOrganizer = recipient.profile.id === profile.id
        const divided = divideShares(total, participantCount + (includeOrganizer ? 1 : 0))
        const payerProfiles = kind === 'named'
          ? includeOrganizer && !recipientIsOrganizer ? [profile, ...members] : members
          : Array.from({ length: participantCount }, () => null)
        const payableAmounts = includeOrganizer && recipientIsOrganizer ? divided.slice(1) : divided
        const created = await deps.products.createSplit(
          profile.id, recipient.address, kind, total.toString(), title, description,
          payerProfiles,
          payableAmounts,
        )
        const stored = await deps.products.split(created.id)
        return reply(201, stored)
      }

      const shareAction = /^\/api\/splits\/([0-9a-f-]{36})\/shares\/(\d+)\/(claim|confirm)$/.exec(path)
      if (req.method === 'POST' && shareAction) {
        if (!deps.products || !uuid.test(shareAction[1])) throw new ApiError(404, 'Split not found.')
        const index = Number(shareAction[2])
        if (!Number.isSafeInteger(index) || index < 0) throw new ApiError(400, 'Share is invalid.')
        const wallet = walletAddress(body.wallet)
        const verifiedWallets = await deps.store.wallets(profile.id)
        if (!verifiedWallets.some(item => item.address === wallet.toLowerCase() && item.chain_id === 5042)) throw new ApiError(403, 'Verify this Arc wallet in JANUS first.')
        const found = await deps.products.split(shareAction[1])
        const selected = found?.shares.find(item => item.share_index === index)
        if (!found || !selected) throw new ApiError(404, 'Split share not found.')
        if (selected.profile_id && selected.profile_id !== profile.id) throw new ApiError(403, 'This named share belongs to another JANUS account.')
        if (shareAction[3] === 'claim') {
          const claimed = await deps.products.claimShare(found.split.id, index, profile.id, wallet.toLowerCase())
          if (!claimed) throw new ApiError(409, 'This share is no longer available.')
          return reply(200, { share: claimed })
        }
        if (!deps.verifyTransfer) throw new ApiError(503, 'Payment verification is not configured.')
        if (typeof body.hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(body.hash)) throw new ApiError(400, 'Transaction hash is invalid.')
        if (selected.profile_id !== profile.id || selected.wallet_address?.toLowerCase() !== wallet.toLowerCase()) throw new ApiError(409, 'Claim this share before confirming its payment.')
        const valid = await deps.verifyTransfer(body.hash as Hash, wallet, walletAddress(found.split.recipient_address), BigInt(selected.amount_raw))
        if (!valid) throw new ApiError(400, 'The transaction does not contain the expected Arc USDC payment.')
        const confirmed = await deps.products.confirmShare(found.split.id, index, profile.id, wallet.toLowerCase(), body.hash.toLowerCase())
        if (!confirmed) throw new ApiError(409, 'This share could not be confirmed.')
        return reply(200, { confirmed: true })
      }
      throw new ApiError(404, 'Not found.')
    } catch (error) {
      reply(error instanceof ApiError ? error.status : 503, { error: error instanceof ApiError ? error.message : 'Service unavailable. Try again.' })
    }
  }
}
