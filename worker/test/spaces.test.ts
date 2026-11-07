import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { sha256Hex } from '../src/auth'
import worker from '../src/index'
import { fakeD1 } from './fake-d1'

// More than one person on one server (F66, D72): each key has its own space, and new people
// come in with a one-time invite from the owner.

const OWNER = 'k'.repeat(43)
const FRIEND = 'f'.repeat(43)
const STRANGER = 's'.repeat(43)

let env: { DB: D1Database }

beforeEach(() => {
  env = { DB: fakeD1() }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

async function call(method: string, path: string, key?: string, body?: unknown): Promise<{ status: number; body: Json }> {
  const headers: Record<string, string> = {}
  if (key) headers.Authorization = `Bearer ${key}`
  const init: RequestInit = { method, headers }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const response = await worker.fetch(new Request(`https://planner-sync.test${path}`, init) as never, env, {} as never)
  return { status: response.status, body: await response.json() }
}

const put = (key: string, id: string, title: string) =>
  call('POST', '/sync', key, { cursor: 0, changes: [{ table: 'tasks', record: { id, updatedAt: 1, title } }] })
const pull = async (key: string) => ((await call('POST', '/sync', key, { cursor: 0, changes: [] })).body.changes as Json[]).map((change) => change.record.title)

describe('spaces', () => {
  it('lets someone in with an invite, once, and keeps their data apart', async () => {
    expect((await call('POST', '/claim', OWNER, {})).status).toBe(200)
    expect((await call('GET', '/me', OWNER)).body).toEqual({ owner: true })

    // No invite, no way in.
    expect((await call('POST', '/claim', FRIEND, {})).status).toBe(409)
    expect((await call('POST', '/claim', FRIEND, { invite: 'NOTACODE1234' })).status).toBe(403)

    const invite = await call('POST', '/invite', OWNER)
    expect(invite.body.code).toMatch(/^[A-Z2-9]{12}$/)
    expect((await call('POST', '/claim', FRIEND, { invite: invite.body.code.toLowerCase() })).status).toBe(200)
    // Used up.
    expect((await call('POST', '/claim', STRANGER, { invite: invite.body.code })).status).toBe(403)
    // The friend's other devices just use the same key.
    expect((await call('POST', '/claim', FRIEND, {})).status).toBe(200)

    await put(OWNER, 'a', 'Owner task')
    await put(FRIEND, 'a', 'Friend task')
    expect(await pull(OWNER)).toEqual(['Owner task'])
    expect(await pull(FRIEND)).toEqual(['Friend task'])
  })

  it('only lets the owner invite', async () => {
    await call('POST', '/claim', OWNER, {})
    const invite = await call('POST', '/invite', OWNER)
    await call('POST', '/claim', FRIEND, { invite: invite.body.code })
    expect((await call('GET', '/me', FRIEND)).body).toEqual({ owner: false })
    expect((await call('POST', '/invite', FRIEND)).status).toBe(403)
    expect((await call('POST', '/invite', STRANGER)).status).toBe(401)
  })

  it('still lets an older app claim with an empty body', async () => {
    const response = await worker.fetch(
      new Request('https://planner-sync.test/claim', { method: 'POST', headers: { Authorization: `Bearer ${OWNER}` } }) as never,
      env,
      {} as never,
    )
    expect(response.status).toBe(200)
  })
})

describe('the move to spaces', () => {
  it("puts everything already on the server into the owner's space", async () => {
    const db = new DatabaseSync(':memory:')
    const migration = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
    db.exec(migration('0001_init.sql'))
    const hash = await sha256Hex(OWNER)
    db.prepare("INSERT INTO meta (key, value) VALUES ('key_hash', ?)").run(hash)
    db.prepare("INSERT INTO records (tbl, id, updated_at, seq, data) VALUES ('tasks', 't1', 5, 7, '{}')").run()
    db.prepare("INSERT INTO subscriptions (endpoint, p256dh, auth, timezone, created_at) VALUES ('https://push.test/1', 'p', 'a', 'UTC', 0)").run()
    db.exec(migration('0002_spaces.sql'))
    expect(db.prepare('SELECT space, tbl, id, seq FROM records').all().map((row) => ({ ...row }))).toEqual([{ space: hash, tbl: 'tasks', id: 't1', seq: 7 }])
    expect(db.prepare('SELECT key_hash FROM spaces').all().map((row) => ({ ...row }))).toEqual([{ key_hash: hash }])
    expect({ ...db.prepare('SELECT space FROM subscriptions').get() }).toEqual({ space: hash })
  })
})
