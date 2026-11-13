import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scannedRecipient } from '../src/lib/scanned-recipient'

test('scan accepts a JANUS receive QR address', () => {
  assert.equal(scannedRecipient('0x1111111111111111111111111111111111111111'), '0x1111111111111111111111111111111111111111')
})

test('scan rejects URLs, payment instructions, and zero addresses', () => {
  for (const value of ['https://example.com/pay?to=0x1111111111111111111111111111111111111111', 'ethereum:0x1111111111111111111111111111111111111111?value=100', '0x0000000000000000000000000000000000000000']) {
    assert.throws(() => scannedRecipient(value))
  }
})
