/**
 * Filibotster CORS relay — Netlify Functions port of worker/src/index.js.
 *
 * Pangram's API rejects browser CORS preflights, so this function forwards
 * POST /task and GET /task/:id verbatim to Pangram. The caller's x-api-key
 * header passes through; nothing is stored or logged. Served from the same
 * origin as the app, so the app's relay URL stays empty; CORS headers are
 * kept anyway so other Filibotster instances may point here too.
 */

const UPSTREAM = 'https://text.external-api.pangram.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-api-key',
  'Access-Control-Max-Age': '86400',
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  const url = new URL(request.url)
  const isSubmit = request.method === 'POST' && url.pathname === '/task'
  const isPoll = request.method === 'GET' && /^\/task\/[\w-]+$/.test(url.pathname)
  if (!isSubmit && !isPoll) {
    return json({ error: 'not found' }, 404)
  }

  const apiKey = request.headers.get('x-api-key')
  if (!apiKey) {
    return json({ error: 'missing x-api-key' }, 401)
  }

  const upstream = await fetch(UPSTREAM + url.pathname, {
    method: request.method,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: isSubmit ? await request.text() : undefined,
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

const json = (obj, status) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })

export const config = {
  path: ['/task', '/task/:id'],
}
