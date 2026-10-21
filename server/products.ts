import { ApiError } from './core.js'

export type ProductProfile = { id: string; username: string; display_name: string }
export type ProductRequest = {
  id: string; requester_id: string; payer_id: string | null; recipient_address: string
  amount_raw: string; description: string; status: string; confirmed_tx_hash: string | null
  expires_at: string | null; created_at: string
}
export type ProductGroup = { id: string; organizer_id: string; name: string; description: string; created_at: string }
export type ProductMembership = { group_id: string; profile_id: string; role: string; status: string }
export type ProductGroupMember = ProductMembership & { username: string; display_name: string }
export type ProductSplit = {
  id: string; organizer_id: string; group_id: string | null; recipient_address: string
  kind: 'named' | 'open'; total_raw: string; share_count: number; title: string
  description: string; chain_id: number; status: string; created_at: string
}
export type ProductShare = {
  split_id: string; share_index: number; wallet_address: string | null; amount_raw: string
  profile_id: string | null; status: string; reserved_until: string | null
  payer_address: string | null; confirmed_tx_hash: string | null
}
export type ProductInboxSplit = { split: ProductSplit; share: ProductShare }
export type ProductInboxGroup = { group: ProductGroup; membership: ProductMembership }
export type ProductPurchase = {
  id: string; chain_id: number; contract_address: string; onchain_id: string; organizer_id: string
  group_id: string | null; title: string; description: string; creation_tx_hash: string; created_at: string
}
export type ProductPurchaseInvitation = { purchase: ProductPurchase; status: string; read_at: string | null; created_at: string }
export type ProductNotification = {
  id: string; recipient_id: string; event_key: string; kind: string
  resource_id: string | null; read_at: string | null; created_at: string
}
export type ProductRefundState = { purchaseId: string; reason: 'cancelled' | 'expired' | null }

export function purchaseRefundNotificationPlan(states: ProductRefundState[], existing: ProductNotification[]) {
  const desired = new Map(states.map(item => [item.purchaseId, item.reason]))
  const stale = existing.filter(item => !desired.get(item.resource_id ?? '') ||
    item.kind !== 'purchase_refund_' + desired.get(item.resource_id ?? ''))
  const staleIds = new Set(stale.map(item => item.id))
  const current = new Set(existing.filter(item => !staleIds.has(item.id)).map(item => item.resource_id))
  const missing = states.filter(item => item.reason && !current.has(item.purchaseId))
  return { stale, missing }
}

type JsonRow = Record<string, unknown>
function rows(value: unknown): JsonRow[] {
  if (!Array.isArray(value) || !value.every(row => row && typeof row === 'object' && !Array.isArray(row)))
    throw new ApiError(503, 'Invalid product storage response.')
  return value as JsonRow[]
}
function text(row: JsonRow, key: string) {
  if (typeof row[key] !== 'string') throw new ApiError(503, 'Invalid product storage response.')
  return row[key]
}
function optionalText(row: JsonRow, key: string) {
  if (row[key] !== null && typeof row[key] !== 'string') throw new ApiError(503, 'Invalid product storage response.')
  return row[key]
}
function numericString(row: JsonRow, key: string) {
  const value = row[key]
  if (typeof value !== 'string' && typeof value !== 'number') throw new ApiError(503, 'Invalid product storage response.')
  return String(value)
}
function profile(row: JsonRow): ProductProfile {
  return { id: text(row, 'id'), username: text(row, 'username'), display_name: text(row, 'display_name') }
}
function paymentRequest(row: JsonRow): ProductRequest {
  return {
    id: text(row, 'id'), requester_id: text(row, 'requester_id'), payer_id: optionalText(row, 'payer_id'),
    recipient_address: text(row, 'recipient_address'), amount_raw: numericString(row, 'amount_raw'),
    description: text(row, 'description'), status: text(row, 'status'),
    confirmed_tx_hash: optionalText(row, 'confirmed_tx_hash'), expires_at: optionalText(row, 'expires_at'),
    created_at: text(row, 'created_at'),
  }
}
function group(row: JsonRow): ProductGroup {
  return { id: text(row, 'id'), organizer_id: text(row, 'organizer_id'), name: text(row, 'name'),
    description: text(row, 'description'), created_at: text(row, 'created_at') }
}
function membership(row: JsonRow): ProductMembership {
  return { group_id: text(row, 'group_id'), profile_id: text(row, 'profile_id'), role: text(row, 'role'), status: text(row, 'status') }
}
function split(row: JsonRow): ProductSplit {
  if (typeof row.share_count !== 'number' || typeof row.chain_id !== 'number' || (row.kind !== 'named' && row.kind !== 'open'))
    throw new ApiError(503, 'Invalid product storage response.')
  return {
    id: text(row, 'id'), organizer_id: text(row, 'organizer_id'), group_id: optionalText(row, 'group_id'),
    recipient_address: text(row, 'recipient_address'), kind: row.kind, total_raw: numericString(row, 'total_raw'),
    share_count: row.share_count, title: text(row, 'title'), description: text(row, 'description'),
    chain_id: row.chain_id, status: text(row, 'status'), created_at: text(row, 'created_at'),
  }
}
function share(row: JsonRow): ProductShare {
  if (typeof row.share_index !== 'number') throw new ApiError(503, 'Invalid product storage response.')
  return {
    split_id: text(row, 'split_id'), share_index: row.share_index,
    wallet_address: optionalText(row, 'wallet_address'), amount_raw: numericString(row, 'amount_raw'),
    profile_id: optionalText(row, 'profile_id'), status: text(row, 'status'),
    reserved_until: optionalText(row, 'reserved_until'), payer_address: optionalText(row, 'payer_address'),
    confirmed_tx_hash: optionalText(row, 'confirmed_tx_hash'),
  }
}
function notification(row: JsonRow): ProductNotification {
  return {
    id: text(row, 'id'), recipient_id: text(row, 'recipient_id'), event_key: text(row, 'event_key'),
    kind: text(row, 'kind'), resource_id: optionalText(row, 'resource_id'),
    read_at: optionalText(row, 'read_at'), created_at: text(row, 'created_at'),
  }
}
function purchase(row: JsonRow): ProductPurchase {
  if (typeof row.chain_id !== 'number') throw new ApiError(503, 'Invalid product storage response.')
  return {
    id: text(row, 'id'), chain_id: row.chain_id, contract_address: text(row, 'contract_address'),
    onchain_id: text(row, 'onchain_id'), organizer_id: text(row, 'organizer_id'),
    group_id: optionalText(row, 'group_id'), title: text(row, 'title'), description: text(row, 'description'),
    creation_tx_hash: text(row, 'creation_tx_hash'), created_at: text(row, 'created_at'),
  }
}
export interface ProductStore {
  profileByUsername(username: string): Promise<ProductProfile | null>
  profileByWallet(address: string): Promise<ProductProfile | null>
  createRequest(ownerId: string, recipient: string, amount: string, description: string, payerId: string | null, expiresAt: string | null): Promise<ProductRequest>
  request(id: string): Promise<ProductRequest | null>
  requestsFor(profileId: string): Promise<ProductRequest[]>
  confirmRequest(id: string, payerId: string, payerAddress: string, hash: string): Promise<boolean>
  cancelRequest(id: string, ownerId: string): Promise<boolean>
  createGroup(ownerId: string, name: string, description: string, members: ProductProfile[]): Promise<ProductGroup>
  groupsFor(profileId: string): Promise<{ groups: ProductGroup[]; memberships: ProductMembership[]; members: ProductGroupMember[] }>
  addGroupMembers(groupId: string, organizerId: string, members: ProductProfile[]): Promise<number>
  removeGroupMember(groupId: string, organizerId: string, memberId: string): Promise<boolean>
  leaveGroup(groupId: string, memberId: string): Promise<boolean>
  respondGroup(groupId: string, profileId: string, status: 'accepted' | 'declined'): Promise<boolean>
  createSplit(ownerId: string, groupId: string | null, recipient: string, kind: 'named' | 'open', total: string, title: string, description: string, memberProfiles: (ProductProfile | null)[], amounts: string[]): Promise<ProductSplit>
  split(id: string): Promise<{ split: ProductSplit; shares: ProductShare[] } | null>
  splitsFor(profileId: string): Promise<ProductSplit[]>
  claimShare(splitId: string, index: number, profileId: string, wallet: string): Promise<ProductShare | null>
  confirmShare(splitId: string, index: number, profileId: string, wallet: string, hash: string): Promise<boolean>
  inbox(profileId: string): Promise<{ requests: ProductRequest[]; memberships: ProductMembership[]; notifications: ProductNotification[]; splits: ProductInboxSplit[]; groups: ProductInboxGroup[]; purchases: ProductPurchaseInvitation[] }>
  markNotification(id: string, profileId: string): Promise<boolean>
  markPurchaseRead(purchaseId: string, profileId: string): Promise<boolean>
  syncPurchaseRefundNotifications(profileId: string, states: ProductRefundState[]): Promise<ProductNotification[]>
  savePurchase(ownerId: string, input: { chainId: number; contract: string; onchainId: string; groupId: string | null; title: string; description: string; txHash: string }, participants: ProductProfile[]): Promise<ProductPurchase>
}

export function createProductStore(url: string, key: string): ProductStore {
  async function request(path: string, method = 'GET', body?: unknown, prefer?: string): Promise<unknown> {
    const response = await fetch(url + '/rest/v1/' + path, {
      method,
      headers: {
        apikey: key,
        ...(key.startsWith('sb_secret_') ? {} : { Authorization: 'Bearer ' + key }),
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) {
      if (response.status === 409) throw new ApiError(409, 'This item conflicts with existing JANUS data.')
      throw new ApiError(503, 'Product storage is unavailable. Try again.')
    }
    const raw = await response.text()
    return raw ? JSON.parse(raw) as unknown : null
  }
  async function one(path: string): Promise<JsonRow | null> {
    return rows(await request(path))[0] ?? null
  }
  async function insertOne(table: string, body: unknown, select = '*') {
    const result = rows(await request(table + '?select=' + select, 'POST', body, 'return=representation'))
    if (result.length !== 1) throw new ApiError(503, 'Product data could not be saved.')
    return result[0]
  }
  async function deleteWhere(path: string) {
    try { await request(path, 'DELETE') } catch { /* best-effort rollback */ }
  }
  return {
    async profileByUsername(username) {
      const row = await one('profiles?username=eq.' + encodeURIComponent(username) + '&select=id,username,display_name')
      return row ? profile(row) : null
    },
    async profileByWallet(address) {
      const wallet = await one('wallet_associations?address=eq.' + encodeURIComponent(address.toLowerCase()) + '&select=profile_id')
      if (!wallet) return null
      const row = await one('profiles?id=eq.' + encodeURIComponent(text(wallet, 'profile_id')) + '&select=id,username,display_name')
      return row ? profile(row) : null
    },
    async createRequest(ownerId, recipient, amount, description, payerId, expiresAt) {
      return paymentRequest(await insertOne('payment_requests', {
        requester_id: ownerId, recipient_address: recipient, payer_id: payerId,
        chain_id: 5042, amount_raw: amount, description, expires_at: expiresAt,
      }))
    },
    async request(id) {
      const row = await one('payment_requests?id=eq.' + encodeURIComponent(id) + '&select=*')
      return row ? paymentRequest(row) : null
    },
    async requestsFor(profileId) {
      return rows(await request('payment_requests?or=(requester_id.eq.' + encodeURIComponent(profileId) + ',payer_id.eq.' + encodeURIComponent(profileId) + ')&select=*&order=created_at.desc')).map(paymentRequest)
    },
    async confirmRequest(id, payerId, payerAddress, hash) {
      const result = rows(await request('payment_requests?id=eq.' + encodeURIComponent(id) + '&payer_id=eq.' + encodeURIComponent(payerId) + '&status=eq.unpaid&select=id', 'PATCH', {
        status: 'paid', paid_by_address: payerAddress, confirmed_tx_hash: hash, updated_at: new Date().toISOString(),
      }, 'return=representation'))
      return result.length === 1
    },
    async cancelRequest(id, ownerId) {
      const result = rows(await request('payment_requests?id=eq.' + encodeURIComponent(id) + '&requester_id=eq.' + encodeURIComponent(ownerId) + '&status=eq.unpaid&select=id', 'PATCH', {
        status: 'cancelled', updated_at: new Date().toISOString(),
      }, 'return=representation'))
      return result.length === 1
    },
    async createGroup(ownerId, name, description, members) {
      const created = group(await insertOne('groups', { organizer_id: ownerId, name, description }))
      try {
        await request('group_members', 'POST', [
          { group_id: created.id, profile_id: ownerId, role: 'organizer', status: 'accepted' },
          ...members.filter(member => member.id !== ownerId).map(member => ({
            group_id: created.id, profile_id: member.id, role: 'member', status: 'invited',
          })),
        ])
        return created
      } catch (error) {
        await deleteWhere('groups?id=eq.' + encodeURIComponent(created.id))
        throw error
      }
    },
    async groupsFor(profileId) {
      const memberships = rows(await request('group_members?profile_id=eq.' + encodeURIComponent(profileId) + '&select=*')).map(membership)
      if (!memberships.length) return { groups: [], memberships, members: [] }
      const ids = memberships.map(row => row.group_id).join(',')
      const groups = rows(await request('groups?id=in.(' + ids + ')&select=*&order=created_at.desc')).map(group)
      const visibleIds = memberships.filter(item => item.role === 'organizer' || item.status === 'accepted').map(item => item.group_id)
      if (!visibleIds.length) return { groups, memberships, members: [] }
      const roster = rows(await request('group_members?group_id=in.(' + visibleIds.join(',') + ')&select=*')).map(membership)
      const profileIds = [...new Set(roster.map(item => item.profile_id))]
      const profiles = profileIds.length
        ? rows(await request('profiles?id=in.(' + profileIds.join(',') + ')&select=id,username,display_name')).map(profile)
        : []
      const byId = new Map(profiles.map(item => [item.id, item]))
      const members = roster.flatMap(item => {
        const owner = byId.get(item.profile_id)
        return owner ? [{ ...item, username: owner.username, display_name: owner.display_name }] : []
      })
      return { groups, memberships, members }
    },
    async addGroupMembers(groupId, organizerId, members) {
      const owned = await one('groups?id=eq.' + encodeURIComponent(groupId) + '&organizer_id=eq.' + encodeURIComponent(organizerId) + '&select=id')
      if (!owned) throw new ApiError(403, 'Only the group organizer can add members.')
      const unique = [...new Map(members.map(item => [item.id, item])).values()].filter(item => item.id !== organizerId)
      if (!unique.length) return 0
      const ids = unique.map(item => item.id).join(',')
      const existing = rows(await request('group_members?group_id=eq.' + encodeURIComponent(groupId) + '&profile_id=in.(' + ids + ')&select=profile_id'))
      if (existing.length) throw new ApiError(409, 'One or more accounts are already in this group.')
      await request('group_members', 'POST', unique.map(item => ({ group_id: groupId, profile_id: item.id, role: 'member', status: 'invited' })))
      return unique.length
    },
    async removeGroupMember(groupId, organizerId, memberId) {
      const owned = await one('groups?id=eq.' + encodeURIComponent(groupId) + '&organizer_id=eq.' + encodeURIComponent(organizerId) + '&select=id')
      if (!owned) throw new ApiError(403, 'Only the group organizer can remove members.')
      const removed = rows(await request('group_members?group_id=eq.' + encodeURIComponent(groupId) + '&profile_id=eq.' + encodeURIComponent(memberId) + '&role=eq.member&select=group_id', 'DELETE', undefined, 'return=representation'))
      return removed.length === 1
    },
    async leaveGroup(groupId, memberId) {
      const removed = rows(await request('group_members?group_id=eq.' + encodeURIComponent(groupId) + '&profile_id=eq.' + encodeURIComponent(memberId) + '&role=eq.member&status=eq.accepted&select=group_id', 'DELETE', undefined, 'return=representation'))
      return removed.length === 1
    },    async respondGroup(groupId, profileId, status) {
      const result = rows(await request('group_members?group_id=eq.' + encodeURIComponent(groupId) + '&profile_id=eq.' + encodeURIComponent(profileId) + '&status=eq.invited&select=group_id', 'PATCH', { status }, 'return=representation'))
      return result.length === 1
    },
    async createSplit(ownerId, groupId, recipient, kind, total, title, description, memberProfiles, amounts) {
      const created = split(await insertOne('splits', {
        organizer_id: ownerId, group_id: groupId, recipient_address: recipient, kind, total_raw: total,
        share_count: amounts.length, title, description, chain_id: 5042,
      }))
      try {
        await request('split_participants', 'POST', amounts.map((amount, index) => ({
          split_id: created.id, share_index: index, amount_raw: amount,
          ...(memberProfiles[index] ? {
            profile_id: memberProfiles[index]?.id,
            wallet_address: null,
            status: 'unclaimed',
          } : {}),
        })))
        return created
      } catch (error) {
        await deleteWhere('splits?id=eq.' + encodeURIComponent(created.id))
        throw error
      }
    },
    async split(id) {
      const row = await one('splits?id=eq.' + encodeURIComponent(id) + '&select=*')
      if (!row) return null
      const shares = rows(await request('split_participants?split_id=eq.' + encodeURIComponent(id) + '&select=*&order=share_index.asc')).map(share)
      return { split: split(row), shares }
    },
    async splitsFor(profileId) {
      const owned = rows(await request('splits?organizer_id=eq.' + encodeURIComponent(profileId) + '&select=*&order=created_at.desc')).map(split)
      const memberships = rows(await request('split_participants?profile_id=eq.' + encodeURIComponent(profileId) + '&select=split_id'))
      const ids = memberships.map(row => text(row, 'split_id')).filter(id => !owned.some(item => item.id === id))
      if (!ids.length) return owned
      const joined = rows(await request('splits?id=in.(' + ids.join(',') + ')&select=*&order=created_at.desc')).map(split)
      return [...owned, ...joined]
    },
    async claimShare(splitId, index, profileId, wallet) {
      await request('split_participants?split_id=eq.' + encodeURIComponent(splitId) + '&share_index=eq.' + index + '&status=eq.reserved&reserved_until=lt.' + encodeURIComponent(new Date().toISOString()), 'PATCH', {
        status: 'unclaimed', profile_id: null, wallet_address: null, reserved_until: null,
      })
      const result = rows(await request('split_participants?split_id=eq.' + encodeURIComponent(splitId) + '&share_index=eq.' + index + '&status=eq.unclaimed&or=(profile_id.is.null,profile_id.eq.' + encodeURIComponent(profileId) + ')&select=*', 'PATCH', {
        status: 'reserved', profile_id: profileId, wallet_address: wallet,
        reserved_until: new Date(Date.now() + 10 * 60000).toISOString(),
      }, 'return=representation'))
      return result.length === 1 ? share(result[0]) : null
    },
    async confirmShare(splitId, index, profileId, wallet, hash) {
      const result = rows(await request('split_participants?split_id=eq.' + encodeURIComponent(splitId) + '&share_index=eq.' + index + '&profile_id=eq.' + encodeURIComponent(profileId) + '&status=in.(reserved,pending)&select=*', 'PATCH', {
        status: 'paid', payer_address: wallet, confirmed_tx_hash: hash, paid_at: new Date().toISOString(), reserved_until: null,
      }, 'return=representation'))
      return result.length === 1
    },
    async inbox(profileId) {
      const [requestsData, membershipsData, notificationsData, participantData, purchaseParticipantData] = await Promise.all([
        request('payment_requests?payer_id=eq.' + encodeURIComponent(profileId) + '&status=eq.unpaid&select=*&order=created_at.desc'),
        request('group_members?profile_id=eq.' + encodeURIComponent(profileId) + '&status=eq.invited&select=*'),
        request('notifications?recipient_id=eq.' + encodeURIComponent(profileId) + '&select=*&order=created_at.desc&limit=100'),
        request('split_participants?profile_id=eq.' + encodeURIComponent(profileId) + '&status=in.(unclaimed,reserved,pending)&select=*&order=split_id.asc,share_index.asc'),
        request('purchase_participants?profile_id=eq.' + encodeURIComponent(profileId) + '&status=eq.invited&select=*&order=created_at.desc'),
      ])
      const invitedMemberships = rows(membershipsData).map(membership)
      const groupIds = [...new Set(invitedMemberships.map(item => item.group_id))]
      const groupRecords = groupIds.length
        ? rows(await request('groups?id=in.(' + groupIds.join(',') + ')&select=*&order=created_at.desc')).map(group)
        : []
      const groupById = new Map(groupRecords.map(item => [item.id, item]))
      const groups = invitedMemberships.flatMap(item => {
        const parent = groupById.get(item.group_id)
        return parent ? [{ group: parent, membership: item }] : []
      })
      const participantShares = rows(participantData).map(share)
      const splitIds = [...new Set(participantShares.map(item => item.split_id))]
      const splitRecords = splitIds.length
        ? rows(await request('splits?id=in.(' + splitIds.join(',') + ')&status=eq.active&select=*&order=created_at.desc')).map(split)
        : []
      const splitById = new Map(splitRecords.map(item => [item.id, item]))
      const splits = participantShares.flatMap(item => {
        const parent = splitById.get(item.split_id)
        return parent ? [{ split: parent, share: item }] : []
      })
      const purchaseInvitations = rows(purchaseParticipantData)
      const purchaseIds = [...new Set(purchaseInvitations.map(item => text(item, 'purchase_id')))]
      const purchaseRecords = purchaseIds.length
        ? rows(await request('purchases?id=in.(' + purchaseIds.join(',') + ')&select=*&order=created_at.desc')).map(purchase)
        : []
      const purchaseById = new Map(purchaseRecords.map(item => [item.id, item]))
      const purchases = purchaseInvitations.flatMap(item => {
        const parent = purchaseById.get(text(item, 'purchase_id'))
        return parent ? [{ purchase: parent, status: text(item, 'status'), read_at: optionalText(item, 'read_at'), created_at: text(item, 'created_at') }] : []
      })
      return {
        requests: rows(requestsData).map(paymentRequest),
        memberships: invitedMemberships,
        notifications: rows(notificationsData).map(notification),
        splits,
        groups,
        purchases,
      }
    },
    async markPurchaseRead(purchaseId, profileId) {
      const result = rows(await request('purchase_participants?purchase_id=eq.' + encodeURIComponent(purchaseId) + '&profile_id=eq.' + encodeURIComponent(profileId) + '&read_at=is.null&select=purchase_id', 'PATCH', {
        read_at: new Date().toISOString(),
      }, 'return=representation'))
      return result.length <= 1
    },    async markNotification(id, profileId) {
      const result = rows(await request('notifications?id=eq.' + encodeURIComponent(id) + '&recipient_id=eq.' + encodeURIComponent(profileId) + '&read_at=is.null&select=id', 'PATCH', { read_at: new Date().toISOString() }, 'return=representation'))
      return result.length === 1
    },
    async syncPurchaseRefundNotifications(profileId, states) {
      const purchaseIds = [...new Set(states.map(item => item.purchaseId))]
      if (purchaseIds.length) {
        const existing = rows(await request('notifications?recipient_id=eq.' + encodeURIComponent(profileId) +
          '&resource_id=in.(' + purchaseIds.join(',') + ')&select=*')).map(notification)
          .filter(item => item.kind === 'purchase_refund_cancelled' || item.kind === 'purchase_refund_expired')
        const { stale, missing } = purchaseRefundNotificationPlan(states, existing)
        if (stale.length) await request('notifications?id=in.(' + stale.map(item => item.id).join(',') + ')', 'DELETE')
        if (missing.length) await request('notifications?on_conflict=recipient_id,event_key', 'POST', missing.map(item => ({
          recipient_id: profileId,
          event_key: 'purchase-refund:' + item.purchaseId,
          kind: 'purchase_refund_' + item.reason,
          resource_id: item.purchaseId,
        })), 'resolution=ignore-duplicates')
      }
      return rows(await request('notifications?recipient_id=eq.' + encodeURIComponent(profileId) + '&select=*&order=created_at.desc&limit=100')).map(notification)
    },
    async savePurchase(ownerId, input, participants) {
      const existing = await one('purchases?chain_id=eq.' + input.chainId + '&contract_address=eq.' + encodeURIComponent(input.contract.toLowerCase()) + '&onchain_id=eq.' + encodeURIComponent(input.onchainId.toLowerCase()) + '&select=*')
      const created = existing ? purchase(existing) : purchase(await insertOne('purchases', {
        chain_id: input.chainId, contract_address: input.contract.toLowerCase(), onchain_id: input.onchainId.toLowerCase(),
        organizer_id: ownerId, group_id: input.groupId, title: input.title, description: input.description,
        creation_tx_hash: input.txHash.toLowerCase(),
      }))
      if (created.organizer_id !== ownerId) throw new ApiError(409, 'This purchase is already owned by another JANUS account.')
      if (participants.length) await request('purchase_participants?on_conflict=purchase_id,profile_id', 'POST', participants.map(item => ({
        purchase_id: created.id, profile_id: item.id, status: 'invited',
      })), 'resolution=ignore-duplicates')
      return created
    },
  }
}