import test from 'node:test'
import assert from 'node:assert/strict'
import { deadlineReminderKind } from '../server/reminders.js'

test('background reminders use the 24-hour and one-hour windows', () => {
  const now = 1_000_000
  assert.equal(deadlineReminderKind(0, 100n, 20n, now + 86401, now + 90000, now), null)
  assert.equal(deadlineReminderKind(0, 100n, 20n, now + 86400, now + 90000, now), 'funding_24h')
  assert.equal(deadlineReminderKind(0, 100n, 20n, now + 3600, now + 90000, now), 'funding_1h')
  assert.equal(deadlineReminderKind(0, 100n, 100n, now + 3600, now + 90000, now), null)
  assert.equal(deadlineReminderKind(1, 100n, 100n, now - 1, now + 3600, now), 'release_1h')
  assert.equal(deadlineReminderKind(2, 100n, 100n, now - 1, now + 3600, now), null)
  assert.equal(deadlineReminderKind(1, 100n, 100n, now - 1, now, now), null)
})
