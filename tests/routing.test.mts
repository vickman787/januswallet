import { test } from 'node:test'
import assert from 'node:assert/strict'
import { restoreApiRequestUrl } from '../server/routing.ts'

test('Vercel wildcard rewrite restores nested JANUS API paths and preserves query parameters', () => {
  assert.equal(
    restoreApiRequestUrl('/api?__janus_path=users%2Fjanus', 'https://januswallet.xyz'),
    '/api/users/janus',
  )
  assert.equal(
    restoreApiRequestUrl('/api?addresses=0xabc&__janus_path=me', 'https://januswallet.xyz'),
    '/api/me?addresses=0xabc',
  )
  assert.equal(
    restoreApiRequestUrl('/api?__janus_path=groups%2Fid%2Fmembers%2Fprofile', 'https://januswallet.xyz'),
    '/api/groups/id/members/profile',
  )
  assert.equal(restoreApiRequestUrl('/api/health', 'https://januswallet.xyz'), '/api/health')
})
