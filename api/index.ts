import type { IncomingMessage, ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { createJanusHandler } from '../server/app.js'
import { runPurchaseDeadlineReminders } from '../server/reminders.js'
import { restoreApiRequestUrl } from '../server/routing.js'

const handler = createJanusHandler()

export default async function janusApi(req: IncomingMessage, res: ServerResponse) {
  req.url = restoreApiRequestUrl(req.url, 'https://januswallet.xyz')
  if (req.url === '/api/cron/purchase-reminders') {
    const secret = process.env.CRON_SECRET?.trim()
    const supplied = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : ''
    const authorized = Boolean(secret && supplied && Buffer.byteLength(secret) === Buffer.byteLength(supplied) &&
      timingSafeEqual(Buffer.from(secret), Buffer.from(supplied)))
    if (req.method !== 'POST' || !authorized) {
      res.writeHead(404).end()
      return
    }
    try {
      const result = await runPurchaseDeadlineReminders()
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(result))
    } catch (error) {
      console.error('Purchase reminder job failed:', error)
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ error: 'Reminder job unavailable.' }))
    }
    return
  }
  return handler(req, res)
}
