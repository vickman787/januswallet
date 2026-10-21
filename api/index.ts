import type { IncomingMessage, ServerResponse } from 'node:http'
import { createJanusHandler } from '../server/app.js'
import { restoreApiRequestUrl } from '../server/routing.js'

const handler = createJanusHandler()

export default function janusApi(req: IncomingMessage, res: ServerResponse) {
  req.url = restoreApiRequestUrl(req.url, 'https://januswallet.xyz')
  return handler(req, res)
}
