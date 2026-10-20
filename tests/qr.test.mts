import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import jsQR from 'jsqr'
import WalletQR from '../src/components/WalletQR.tsx'

const address = '0x1111111111111111111111111111111111111111'

test('the actual receive component produces a QR that decodes to the exact destination', async () => {
  const markup = renderToStaticMarkup(React.createElement(WalletQR, { address }))
  const svg = markup.match(/<svg[\s\S]*?<\/svg>/)?.[0]
  assert.ok(svg)
  const { data, info } = await sharp(Buffer.from(svg)).resize(600, 600).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height)
  assert.equal(decoded?.data, address)
  assert.match(markup, /Wallet receive QR/)
  assert.doesNotMatch(markup, /qrserver|localhost/)
})
