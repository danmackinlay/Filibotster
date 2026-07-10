/**
 * Filibotster CORS relay (SPEC §3.5).
 *
 * Pangram's API rejects browser CORS preflights, so this Worker forwards
 * POST /task and GET /task/:id verbatim to Pangram and adds CORS headers.
 * The caller's x-api-key header passes through; nothing is stored or logged.
 *
 * Deploy your own:  cd worker && npx wrangler deploy
 */

const UPSTREAM = 'https://text.external-api.pangram.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-api-key',
  'Access-Control-Max-Age': '86400',
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const url = new URL(request.url)
    const isSubmit = request.method === 'POST' && url.pathname === '/task'
    const isPoll = request.method === 'GET' && /^\/task\/[\w-]+$/.test(url.pathname)
    if (!isSubmit && !isPoll) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const apiKey = request.headers.get('x-api-key')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'missing x-api-key' }), {
        status: 401,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const upstream = await fetch(UPSTREAM + url.pathname, {
      method: request.method,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: isSubmit ? request.body : undefined,
    })

    const headers = new Headers(upstream.headers)
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
    return new Response(upstream.body, { status: upstream.status, headers })
  },
}
