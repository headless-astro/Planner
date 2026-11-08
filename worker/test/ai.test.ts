import { beforeEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { fakeD1 } from './fake-d1'

// The AI connector (F74, F75): the app's summary, sign-in codes, the OAuth sign-in Claude goes
// through, the MCP tools, and turning it all off.

const KEY = 'k'.repeat(43)
const FRIEND = 'f'.repeat(43)
const ORIGIN = 'https://planner-sync.test'
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'

/** Cloudflare KV, in memory: what the OAuth library uses. */
function fakeKV(): KVNamespace {
  const store = new Map<string, { value: string; metadata?: unknown; expires?: number }>()
  const live = (key: string) => {
    const item = store.get(key)
    if (item?.expires && item.expires < Date.now()) {
      store.delete(key)
      return undefined
    }
    return item
  }
  const read = (value: string, type?: unknown) => {
    const kind = typeof type === 'string' ? type : (type as { type?: string } | undefined)?.type
    return kind === 'json' ? JSON.parse(value) : value
  }
  return {
    async get(key: string, type?: unknown) {
      const item = live(key)
      return item ? read(item.value, type) : null
    },
    async getWithMetadata(key: string, type?: unknown) {
      const item = live(key)
      return { value: item ? read(item.value, type) : null, metadata: item?.metadata ?? null }
    },
    async put(key: string, value: string, options?: { expirationTtl?: number; expiration?: number; metadata?: unknown }) {
      const expires = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : options?.expiration ? options.expiration * 1000 : undefined
      store.set(key, { value: String(value), metadata: options?.metadata, expires })
    },
    async delete(key: string) {
      store.delete(key)
    },
    async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
      const keys = [...store.keys()].filter((key) => live(key) && key.startsWith(options?.prefix ?? '')).sort()
      const start = options?.cursor ? Number(options.cursor) : 0
      const limit = options?.limit ?? 1000
      const page = keys.slice(start, start + limit)
      const done = start + limit >= keys.length
      return { keys: page.map((name) => ({ name, metadata: store.get(name)?.metadata })), list_complete: done, cursor: done ? undefined : String(start + limit), cacheStatus: null }
    },
  } as unknown as KVNamespace
}

let env: { DB: D1Database; OAUTH_KV: KVNamespace; APP_URL: string }

beforeEach(() => {
  env = { DB: fakeD1(), OAUTH_KV: fakeKV(), APP_URL: 'https://someone.github.io/Planner/' }
})

const ctx = () => ({ waitUntil() {}, passThroughOnException() {}, props: {} }) as never

async function send(path: string, init: RequestInit & { key?: string; token?: string; json?: unknown } = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.key) headers.set('Authorization', `Bearer ${init.key}`)
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`)
  let body = init.body
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(init.json)
  }
  return worker.fetch(new Request(`${ORIGIN}${path}`, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body, redirect: 'manual' }) as never, env as never, ctx())
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any
const post = async (path: string, key: string, json: unknown = {}): Promise<{ status: number; body: Json }> => {
  const response = await send(path, { method: 'POST', key, json })
  return { status: response.status, body: await response.json() }
}

/** Turns "Connect an AI" on or off the way the app does: a synced setting. */
const setAi = (connect: boolean, key = KEY, updatedAt = Date.now()) =>
  post('/sync', key, { cursor: 0, changes: [{ table: 'settings', record: { id: 'ai', updatedAt, value: { connect } } }] })

const WEEK = {
  monday: '2026-11-02',
  inProgress: false,
  crunchDays: 0,
  habits: [{ label: 'Read', count: 3, target: 4 }],
  tracks: [],
  eating: { mostly: 4, partly: 2, notReally: 1 },
  routinesDone: 2,
  tasksDone: 5,
  review: { well: 'Walked every day' },
  days: [{ date: '2026-11-03', eating: 'partly', diary: 'Lentil soup, then crisps at night' }],
}

async function setUp(): Promise<void> {
  await post('/claim', KEY)
  await setAi(true)
}

describe('the summary the app sends', () => {
  it('is refused while Connect an AI is off', async () => {
    await post('/claim', KEY)
    expect((await post('/ai/weeks', KEY, { weeks: [{ monday: WEEK.monday, data: WEEK }] })).status).toBe(403)
    expect((await post('/ai/code', KEY)).status).toBe(403)
  })

  it('is stored per week, and weeks the app no longer has go', async () => {
    await setUp()
    const sent = await post('/ai/weeks', KEY, {
      weeks: [
        { monday: '2026-10-26', data: { ...WEEK, monday: '2026-10-26' } },
        { monday: WEEK.monday, data: WEEK },
      ],
      keep: ['2026-10-26', WEEK.monday],
      context: { guidelines: ['Protein at every meal'], generatedAt: '2026-11-08T10:00:00Z' },
    })
    expect(sent).toMatchObject({ status: 200, body: { stored: 3 } })
    await post('/ai/weeks', KEY, { weeks: [], keep: [WEEK.monday] })
    const rows = await env.DB.prepare('SELECT week FROM ai_weeks ORDER BY week').all<{ week: string }>()
    expect(rows.results.map((row) => row.week)).toEqual(['2026-11-02', 'context'])
  })

  it('turns away bad weeks', async () => {
    await setUp()
    expect((await post('/ai/weeks', KEY, { weeks: [{ monday: 'last week', data: {} }] })).status).toBe(400)
    expect((await post('/ai/weeks', KEY, { nope: true })).status).toBe(400)
  })
})

describe('sign-in codes', () => {
  it('are 8 letters and digits, from the owner or anyone with a space', async () => {
    await setUp()
    const { status, body } = await post('/ai/code', KEY)
    expect(status).toBe(200)
    expect(body.code).toMatch(/^[A-Z2-9]{8}$/)
    expect(body.expires).toBeGreaterThan(Date.now())
  })
})

// ── The whole sign-in, the way Claude does it ──

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function signIn(key = KEY): Promise<{ token: string; clientId: string }> {
  const registered = await send('/oauth/register', {
    method: 'POST',
    json: { redirect_uris: [REDIRECT], client_name: 'Claude', token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] },
  })
  expect(registered.status).toBe(201)
  const clientId = ((await registered.json()) as Json).client_id as string

  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'xyz',
    resource: `${ORIGIN}/mcp`,
  })
  const pageResponse = await send(`/authorize?${query}`)
  expect(pageResponse.status).toBe(200)
  const page = await pageResponse.text()
  expect(page).toContain('Connect Claude to your planner?')
  expect(page).toContain('https://someone.github.io/Planner/#/ai')
  const handle = /name="handle" value="([^"]+)"/.exec(page)?.[1] ?? ''
  const cookie = (pageResponse.headers.get('Set-Cookie') ?? '').split(';')[0]

  const form = (code: string) => new URLSearchParams({ handle, code, decision: 'approve' })
  // A wrong code keeps the page, so it can be typed again.
  const wrong = await send('/authorize', { method: 'POST', body: form('AAAA2222'), headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' } })
  expect(wrong.status).toBe(400)
  expect(await wrong.text()).toContain('That code didn’t work')

  const { body } = await post('/ai/code', key)
  const approved = await send('/authorize', { method: 'POST', body: form(body.code.toLowerCase()), headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' } })
  expect(approved.status).toBe(302)
  const location = new URL(approved.headers.get('Location') ?? '')
  expect(`${location.origin}${location.pathname}`).toBe(REDIRECT)
  expect(location.searchParams.get('state')).toBe('xyz')

  const tokenResponse = await send('/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: location.searchParams.get('code') ?? '',
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
      resource: `${ORIGIN}/mcp`,
    }),
  })
  expect(tokenResponse.status).toBe(200)
  return { token: ((await tokenResponse.json()) as Json).access_token as string, clientId }
}

let rpcId = 0
async function rpc(token: string, method: string, params: object = {}): Promise<{ status: number; body: Json }> {
  const response = await send('/mcp', {
    method: 'POST',
    token,
    headers: { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' },
    json: { jsonrpc: '2.0', id: ++rpcId, method, params },
  })
  return { status: response.status, body: response.status === 200 ? await response.json() : await response.text() }
}

const callTool = async (token: string, name: string, args: object = {}) => (await rpc(token, 'tools/call', { name, arguments: args })).body.result

describe('the connector', () => {
  it('asks for a sign-in, and says where', async () => {
    await setUp()
    const response = await send('/mcp', { method: 'POST', json: { jsonrpc: '2.0', id: 1, method: 'tools/list' } })
    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toContain('resource_metadata')
    const metadata = (await (await send('/.well-known/oauth-protected-resource/mcp')).json()) as Json
    expect(metadata.resource).toBe(`${ORIGIN}/mcp`)
    const server = (await (await send('/.well-known/oauth-authorization-server')).json()) as Json
    expect(server.registration_endpoint).toBe(`${ORIGIN}/oauth/register`)
  })

  it('signs in with a code, reads the data, and saves an analysis that syncs', async () => {
    await setUp()
    await post('/ai/weeks', KEY, { weeks: [{ monday: WEEK.monday, data: WEEK }], context: { guidelines: ['Protein at every meal'], generatedAt: '2026-11-08T10:00:00Z' } })
    const { token } = await signIn()

    const init = await rpc(token, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    expect(init.body.result.serverInfo.name).toBe('planner')
    expect(init.body.result.instructions).toContain('get_planner_data')
    const tools = (await rpc(token, 'tools/list')).body.result.tools.map((tool: { name: string }) => tool.name)
    expect(tools).toEqual(['get_planner_data', 'list_saved_analyses', 'read_saved_analysis', 'save_analysis'])

    const data = (await callTool(token, 'get_planner_data', { weeks: 4 })).content[0].text as string
    expect(data).toContain('# Planner data for analysis')
    expect(data).toContain('Protein at every meal')
    expect(data).toContain('Lentil soup, then crisps at night')
    expect(data).toContain('Went well: Walked every day')
    const trendsOnly = (await callTool(token, 'get_planner_data', { include: ['trends'] })).content[0].text as string
    expect(trendsOnly).not.toContain('Lentil soup')

    const saved = await callTool(token, 'save_analysis', { title: 'First look', text: 'Evenings are the hard part.' })
    expect(saved.content[0].text).toContain('Saved as “First look”')
    const list = (await callTool(token, 'list_saved_analyses')).content[0].text as string
    const id = /- (ai-[\w-]+):/.exec(list)?.[1] ?? ''
    expect(list).toContain('“First look” (Claude)')
    expect((await callTool(token, 'read_saved_analysis', { id })).content[0].text).toContain('Evenings are the hard part.')

    // It reaches the devices like any other change.
    const pulled = await post('/sync', KEY, { cursor: 0, changes: [] })
    const record = pulled.body.changes.find((change: Json) => change.table === 'analyses')?.record
    expect(record).toMatchObject({ id, title: 'First look', text: 'Evenings are the hard part.', source: 'connector', by: 'Claude' })
  })

  it('reads only its own space', async () => {
    await setUp()
    const { body } = await post('/invite', KEY)
    await post('/claim', FRIEND, { invite: body.code })
    await setAi(true, FRIEND)
    await post('/ai/weeks', KEY, { weeks: [{ monday: WEEK.monday, data: WEEK }] })
    const { token } = await signIn(FRIEND)
    expect((await callTool(token, 'get_planner_data')).content[0].text).toContain('No data yet')
  })

  it('stops answering when Connect an AI is turned off, and signs everyone out', async () => {
    await setUp()
    const { token } = await signIn()
    await setAi(false, KEY, Date.now() + 1)
    const off = await callTool(token, 'get_planner_data')
    expect(off.isError).toBe(true)
    expect(off.content[0].text).toContain('turned off')

    expect((await post('/ai/off', KEY)).body).toEqual({ signedOut: 1 })
    expect((await rpc(token, 'tools/list')).status).toBe(401)
    const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM ai_weeks').first<number>('n')
    expect(rows).toBe(0)
  })

  it('still answers the app’s CORS check and routes', async () => {
    const preflight = await send('/sync', { method: 'OPTIONS' })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
    expect(((await (await send('/')).json()) as Json).connector).toBe(true)
  })
})

describe('a server without the connector set up', () => {
  it('works as before, and says the connector needs an update', async () => {
    const plain = { DB: env.DB }
    const response = await worker.fetch(new Request(`${ORIGIN}/mcp`, { method: 'POST' }) as never, plain as never, ctx())
    expect(response.status).toBe(503)
    const root = (await (await worker.fetch(new Request(`${ORIGIN}/`) as never, plain as never, ctx())).json()) as Json
    expect(root.connector).toBe(false)
  })
})
