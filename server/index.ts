/**
 * Janus API server — runs alongside the Vite dev server.
 * Handles Tenderly simulation and Zerion activity feed proxying.
 * Environment vars read at runtime (set in .env or system env).
 */

const ARC_CHAIN_ID = '5042002'

function getEnv(key: string) {
  return process.env[key] ?? ''
}

async function handleSimulate(req: Request): Promise<Response> {
  const { from, to, data, value } = (await req.json()) as {
    from: string
    to: string
    data?: string
    value?: string
  }

  const tenderlyAccount = getEnv('TENDERLY_ACCOUNT_SLUG')
  const tenderlyProject = getEnv('TENDERLY_PROJECT_SLUG')
  const tenderlyKey = getEnv('TENDERLY_ACCESS_KEY')

  // Fallback: if no Tenderly key, return mock success so UI works without credentials
  if (!tenderlyKey || !tenderlyAccount || !tenderlyProject) {
    return Response.json({ success: true, gasUsed: 120000, error: null, mock: true })
  }

  // arc-studio-allow-onchain-literal — Tenderly is a third-party API, not an RPC endpoint
  const tenderlyBase = 'https://api.tenderly.co'

  try {
    const res = await fetch(
      `${tenderlyBase}/api/v1/account/${tenderlyAccount}/project/${tenderlyProject}/simulate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Key': tenderlyKey,
        },
        body: JSON.stringify({
          network_id: ARC_CHAIN_ID,
          from,
          to,
          input: data ?? '0x',
          value: value ?? '0',
          save: true,
        }),
      }
    )
    const simulation = (await res.json()) as {
      transaction?: { status?: boolean; gas_used?: number; error_message?: string }
    }
    const isSuccess = simulation.transaction?.status ?? true
    return Response.json({
      success: isSuccess,
      gasUsed: simulation.transaction?.gas_used ?? 0,
      error: isSuccess ? null : (simulation.transaction?.error_message ?? 'Simulated revert'),
      mock: false,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Simulation failed'
    return Response.json({ success: false, gasUsed: 0, error: msg, mock: false }, { status: 500 })
  }
}

async function handleActivity(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const address = url.searchParams.get('address')
  if (!address) {
    return Response.json({ error: 'Missing address' }, { status: 400 })
  }

  const zerionKey = getEnv('ZERION_API_KEY')
  // Fallback: no key → return empty list so UI degrades gracefully
  if (!zerionKey) {
    return Response.json({ transactions: [], mock: true })
  }

  // arc-studio-allow-onchain-literal — Zerion is a third-party portfolio API, not an RPC endpoint
  const zerionBase = 'https://api.zerion.io'

  try {
    const auth = btoa(`${zerionKey}:`)
    const res = await fetch(
      `${zerionBase}/v1/wallets/${address}/transactions/?page[size]=10`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
        },
      }
    )
    const data = (await res.json()) as { data?: unknown[] }
    return Response.json({ transactions: data.data ?? [], mock: false })
  } catch {
    return Response.json({ transactions: [], mock: true })
  }
}

const PORT = 3001

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    // CORS for Vite dev proxy
    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders, status: 204 })

    let res: Response
    if (url.pathname === '/api/simulate' && req.method === 'POST') {
      res = await handleSimulate(req)
    } else if (url.pathname === '/api/activity' && req.method === 'GET') {
      res = await handleActivity(req)
    } else {
      res = Response.json({ error: 'Not found' }, { status: 404 })
    }

    // Attach CORS headers to every response
    const newHeaders = new Headers(res.headers)
    for (const [k, v] of Object.entries(corsHeaders)) newHeaders.set(k, v)
    return new Response(res.body, { status: res.status, headers: newHeaders })
  },
})

console.log(`Janus API server listening on http://localhost:${server.port}`)
