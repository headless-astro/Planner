import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import { dueReminders, localClock } from '../src/reminders'
import { fakeD1 } from './fake-d1'

// The Worker, called the way Cloudflare calls it, with an in-memory database.

const KEY = 'k'.repeat(43)
const OTHER = 'o'.repeat(43)

let env: { DB: D1Database }

beforeEach(() => {
  env = { DB: fakeD1() }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

async function call(method: string, path: string, options: { key?: string; body?: unknown } = {}): Promise<{ status: number; body: Json }> {
  const headers: Record<string, string> = { Origin: 'https://someone.github.io' }
  if (options.key) headers.Authorization = `Bearer ${options.key}`
  const init: RequestInit = { method, headers }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }
  const response = await worker.fetch(new Request(`https://planner-sync.test${path}`, init) as never, env, {} as never)
  return { status: response.status, body: await response.json() }
}

const record = (id: string, updatedAt: number, fields: object = {}) => ({ id, updatedAt, ...fields })
const syncCall = (body: object, key = KEY) => call('POST', '/sync', { key, body })

describe('the login', () => {
  it('belongs to the first device that connects', async () => {
    expect((await call('GET', '/')).body).toMatchObject({ app: 'planner-sync', claimed: false })
    expect((await call('POST', '/claim', { key: KEY })).status).toBe(200)
    expect((await call('GET', '/')).body).toMatchObject({ claimed: true })
    expect((await call('POST', '/claim', { key: KEY })).status).toBe(200)
    expect((await call('POST', '/claim', { key: OTHER })).status).toBe(409)
  })

  it('turns away requests without the right key', async () => {
    expect((await syncCall({ cursor: 0, changes: [] })).status).toBe(409)
    await call('POST', '/claim', { key: KEY })
    expect((await call('POST', '/sync', { body: { cursor: 0, changes: [] } })).status).toBe(401)
    expect((await syncCall({ cursor: 0, changes: [] }, OTHER)).status).toBe(401)
    expect((await syncCall({ cursor: 0, changes: [] })).status).toBe(200)
  })

  it("answers the browser's CORS check", async () => {
    const response = await worker.fetch(new Request('https://planner-sync.test/sync', { method: 'OPTIONS' }) as never, env, {} as never)
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
  })
})

describe('sync', () => {
  beforeEach(async () => {
    await call('POST', '/claim', { key: KEY })
  })

  it('passes changes from one device to the other, and the newer change wins', async () => {
    const phone = await syncCall({
      cursor: 0,
      changes: [
        { table: 'entries', record: record('2026-11-02|tick:skin', 100, { value: true }) },
        { table: 'tasks', record: record('t1', 100, { title: 'Call mum' }) },
      ],
    })
    expect(phone.body).toMatchObject({ accepted: 2, more: false, reset: false })

    const pc = await syncCall({ cursor: 0, changes: [] })
    expect(pc.body.changes.map((change: Json) => change.record.id)).toEqual(['2026-11-02|tick:skin', 't1'])

    const older = await syncCall({ cursor: pc.body.cursor, changes: [{ table: 'tasks', record: record('t1', 50, { title: 'old' }) }] })
    expect(older.body.accepted).toBe(0)
    const newer = await syncCall({ cursor: pc.body.cursor, changes: [{ table: 'tasks', record: record('t1', 200, { title: 'Call mum today' }) }] })
    expect(newer.body.accepted).toBe(1)

    const back = await syncCall({ cursor: phone.body.cursor, changes: [] })
    expect(back.body.changes).toEqual([{ table: 'tasks', record: record('t1', 200, { title: 'Call mum today' }) }])
  })

  it('hands out a big backlog in pages', async () => {
    const changes = (from: number) => Array.from({ length: 400 }, (_, i) => ({ table: 'entries', record: record(`e${from + i}`, 1) }))
    await syncCall({ cursor: 0, changes: changes(0) })
    await syncCall({ cursor: 0, changes: changes(400) })
    const first = await syncCall({ cursor: 0, changes: [] })
    expect(first.body.changes).toHaveLength(500)
    expect(first.body.more).toBe(true)
    const second = await syncCall({ cursor: first.body.cursor, changes: [] })
    expect(second.body.changes).toHaveLength(300)
    expect(second.body.more).toBe(false)
  })

  it('tells a device to start over when the server was reset', async () => {
    expect((await syncCall({ cursor: 42, changes: [] })).body).toMatchObject({ reset: true, cursor: 0 })
  })

  it("refuses changes it can't store", async () => {
    expect((await syncCall({ cursor: 0, changes: [{ table: 'drop table', record: record('x', 1) }] })).status).toBe(400)
    expect((await syncCall({ cursor: 0, changes: [{ table: 'tasks', record: { id: 'x' } }] })).status).toBe(400)
    expect((await syncCall({ cursor: -1, changes: [] })).status).toBe(400)
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ table: 'tasks', record: record(`r${i}`, 1) }))
    expect((await syncCall({ cursor: 0, changes: tooMany })).status).toBe(413)
  })
})

describe('reminders', () => {
  const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/device-1'
  let pushes: Request[]
  let status: number

  beforeEach(async () => {
    await call('POST', '/claim', { key: KEY })
    pushes = []
    status = 201
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        pushes.push(new Request(input, init))
        return new Response(null, { status })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const subscribe = (timezone = 'Europe/Istanbul') =>
    call('POST', '/push/subscribe', { key: KEY, body: { subscription: { endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } }, timezone } })

  async function runAt(iso: string) {
    const waits: Promise<unknown>[] = []
    const controller = { scheduledTime: Date.parse(iso), cron: '*/5 * * * *', noRetry() {} }
    await worker.scheduled(controller, env, { waitUntil: (promise: Promise<unknown>) => waits.push(promise), passThroughOnException() {} } as never)
    await Promise.all(waits)
  }

  it('signs pushes so push services accept them', async () => {
    const { body } = await call('GET', '/push/key')
    expect((await call('GET', '/push/key')).body.publicKey).toBe(body.publicKey)
    expect((await subscribe()).status).toBe(200)
    expect((await call('POST', '/push/test', { key: KEY, body: { endpoint: ENDPOINT } })).body).toEqual({ result: 'sent' })

    const [push] = pushes
    expect(push.url).toBe(ENDPOINT)
    expect(push.headers.get('TTL')).toBe('3600')
    const match = /^vapid t=([^,]+), k=(.+)$/.exec(push.headers.get('Authorization') ?? '')
    expect(match?.[2]).toBe(body.publicKey)
    const [header, claims, signature] = (match?.[1] ?? '').split('.')
    const decode = (part: string) => Buffer.from(part, 'base64url')
    const publicKey = await crypto.subtle.importKey('raw', decode(body.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const signed = new TextEncoder().encode(`${header}.${claims}`)
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, decode(signature), signed)).toBe(true)
    expect(JSON.parse(decode(claims).toString())).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'https://someone.github.io' })
  })

  it('sends the morning and night reminders once each, at your times', async () => {
    await subscribe()
    await runAt('2026-11-02T08:55:00Z') // 11:55 in Istanbul
    expect(pushes).toHaveLength(0)
    await runAt('2026-11-02T09:00:00Z') // 12:00
    await runAt('2026-11-02T09:05:00Z')
    expect(pushes).toHaveLength(1)
    await runAt('2026-11-02T21:00:00Z') // 00:00 on the 3rd
    expect(pushes).toHaveLength(2)
  })

  it('uses the times set in the app', async () => {
    await syncCall({ cursor: 0, changes: [{ table: 'settings', record: record('reminders', 5, { value: { morning: '10:30', night: '23:45' } }) }] })
    await subscribe()
    await runAt('2026-11-02T07:30:00Z') // 10:30
    await runAt('2026-11-02T20:45:00Z') // 23:45
    await runAt('2026-11-02T21:00:00Z') // 00:00, no longer a reminder time
    expect(pushes).toHaveLength(2)
  })

  it('catches up on a late run and retries a push that failed', async () => {
    await subscribe()
    status = 500
    await runAt('2026-11-02T09:10:00Z')
    status = 201
    await runAt('2026-11-02T09:15:00Z')
    await runAt('2026-11-02T09:20:00Z')
    expect(pushes).toHaveLength(2)
  })

  it('forgets a device whose subscription has gone', async () => {
    await subscribe()
    status = 410
    await runAt('2026-11-02T09:00:00Z')
    status = 201
    await runAt('2026-11-02T21:00:00Z')
    expect(pushes).toHaveLength(1)
    expect((await call('POST', '/push/test', { key: KEY, body: { endpoint: ENDPOINT } })).status).toBe(404)
  })

  it('refuses a subscription that is not a web push address', async () => {
    const bad = await call('POST', '/push/subscribe', {
      key: KEY,
      body: { subscription: { endpoint: 'http://example.com', keys: { p256dh: 'p', auth: 'a' } }, timezone: 'Europe/Istanbul' },
    })
    expect(bad.status).toBe(400)
    expect((await call('POST', '/push/subscribe', { key: KEY, body: { subscription: { endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } }, timezone: 'Mars/Base' } })).status).toBe(400)
  })
})

describe('reminder times', () => {
  it("reads the clock in the device's time zone", () => {
    expect(localClock(new Date('2026-11-02T21:30:00Z'), 'Europe/Istanbul')).toEqual({ date: '2026-11-03', minutes: 30 })
  })

  it('gives a reminder from just before midnight to the day before', () => {
    expect(dueReminders({ morning: '12:00', night: '23:50' }, { date: '2026-11-03', minutes: 10 })).toEqual([{ kind: 'night', day: '2026-11-02' }])
    expect(dueReminders({ morning: '12:00', night: '00:00' }, { date: '2026-11-03', minutes: 3 })).toEqual([{ kind: 'night', day: '2026-11-03' }])
    expect(dueReminders({ morning: '12:00', night: '00:00' }, { date: '2026-11-03', minutes: 12 * 60 + 40 })).toEqual([])
  })
})
