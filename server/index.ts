import { createServer } from 'node:http'
import { createJanusHandler } from './app.js'

const handler = createJanusHandler()
const server = createServer((req, res) => { void handler(req, res) })
server.requestTimeout = 15000
server.headersTimeout = 10000
server.listen(Number(process.env.API_PORT ?? 3001), process.env.API_HOST ?? '127.0.0.1', () => console.info('JANUS account API listening.'))