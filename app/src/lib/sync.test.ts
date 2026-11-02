import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportBackup } from './backup'
import { db, DIRTY } from './db'
import { addTodo, ensureSeeded, setEntry, toggleTick } from './repo'
import { connect, getSyncState, linkFor, readLink, serverAddress, syncNow } from './sync'

// The sync client against a small in-memory server that follows the Worker's rules
// (the Worker itself is tested in worker/test).

type Row = { id: string; updatedAt: number; [field: string]: unknown }

function fakeServer() {
  const rows = new Map<string, { table: string; record: Row; seq: number }>()
  let seq = 0
  let claimedBy: string | null = null
  let online = true
  /** Runs while a sync request is in flight, to change things on the device meanwhile. */
  let during: (() => Promise<void>) | null = null

  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  async function handle(url: string, init: RequestInit = {}): Promise<Response> {
    if (!online) throw new TypeError('Failed to fetch')
    const path = new URL(url).pathname
    const key = /^Bearer (.+)$/.exec(new Headers(init.headers).get('Authorization') ?? '')?.[1] ?? null
    const body = init.body ? JSON.parse(init.body as string) : undefined
    if (path === '/') return reply({ app: 'planner-sync', claimed: claimedBy !== null })
    if (path === '/claim') {
      if (claimedBy && claimedBy !== key) return reply({ error: 'taken' }, 409)
      claimedBy = key
      return reply({ claimed: true })
    }
    if (key !== claimedBy) return reply({ error: 'Wrong key.' }, 401)
    if (path !== '/sync') return reply({ error: 'Not found.' }, 404)
    if (during) {
      const change = during
      during = null
      await change()
    }
    if (body.cursor > seq) return reply({ cursor: 0, changes: [], more: false, accepted: 0, reset: true })
    let accepted = 0
    for (const { table, record } of body.changes as { table: string; record: Row }[]) {
      const current = rows.get(`${table}|${record.id}`)
      if (!current || current.record.updatedAt < record.updatedAt) {
        rows.set(`${table}|${record.id}`, { table, record, seq: ++seq })
        accepted++
      }
    }
    const newer = [...rows.values()].filter((row) => row.seq > body.cursor).sort((a, b) => a.seq - b.seq)
    const page = newer.slice(0, 500)
    return reply({
      cursor: page.length ? page[page.length - 1].seq : body.cursor,
      changes: page.map(({ table, record }) => ({ table, record })),
      more: newer.length > 500,
      accepted,
      reset: false,
    })
  }

  return {
    handle,
    has: (table: string, id: string) => rows.get(`${table}|${id}`)?.record,
    /** A change made on the other device. */
    put: (table: string, record: Row) => rows.set(`${table}|${record.id}`, { table, record, seq: ++seq }),
    tables: () => new Set([...rows.values()].map((row) => row.table)),
    lose: () => {
      rows.clear()
      seq = 0
    },
    claim: (key: string) => (claimedBy = key),
    setOnline: (value: boolean) => (online = value),
    whileSyncing: (change: () => Promise<void>) => (during = change),
  }
}

let server: ReturnType<typeof fakeServer>
const SERVER = 'https://planner-sync.test'
const dirtyCount = () => db.entries.where(DIRTY).equals(1).count()

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded()
  server = fakeServer()
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => server.handle(url, init)))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('connecting', () => {
  it("sends this device's changes, but not the starting setup every device has", async () => {
    await toggleTick('2026-11-02', 'skin')
    await addTodo('Call the bank', '2026-11-02')
    await connect(SERVER)

    expect(server.has('entries', '2026-11-02|tick:skin')).toMatchObject({ value: true })
    expect(server.tables()).toEqual(new Set(['entries', 'tasks']))
    expect(await dirtyCount()).toBe(0)
    expect(await getSyncState()).toMatchObject({ config: { server: SERVER }, error: null })
    expect((await getSyncState()).lastSync).toBeTypeOf('number')
  })

  it('refuses a server that another key already owns', async () => {
    server.claim('someone-else-entirely-with-a-long-key')
    await expect(connect(SERVER)).rejects.toThrow('already connected')
    expect((await getSyncState()).config).toBeNull()
  })
})

describe('syncing', () => {
  beforeEach(async () => {
    await connect(SERVER)
  })

  it("brings in the other device's changes, and the newer change wins", async () => {
    await setEntry('2026-11-02', 'note', 'written here')
    const mine = (await db.entries.get('2026-11-02|note'))!
    server.put('entries', { ...mine, value: 'older, from the phone', updatedAt: mine.updatedAt - 1000 })
    server.put('tasks', { id: 'from-phone', title: 'Buy yarn', date: '2026-11-02', due: null, listId: null, parentId: null, done: false, doneDate: null, order: 9, updatedAt: Date.now() + 1000 })

    await syncNow()
    expect((await db.entries.get('2026-11-02|note'))?.value).toBe('written here')
    expect(server.has('entries', '2026-11-02|note')).toMatchObject({ value: 'written here' })
    const task = await db.tasks.get('from-phone')
    expect(task).toMatchObject({ title: 'Buy yarn' })
    // What came from the server isn't sent back as a change of this device's.
    expect(task).not.toHaveProperty(DIRTY)
  })

  it('keeps a change made during a sync for the next one', async () => {
    await toggleTick('2026-11-03', 'skin')
    server.whileSyncing(() => setEntry('2026-11-03', 'tick:skin', false))
    await syncNow()
    expect(await dirtyCount()).toBe(1)
    await syncNow()
    expect(server.has('entries', '2026-11-03|tick:skin')).toMatchObject({ value: false })
    expect(await dirtyCount()).toBe(0)
  })

  it('sends everything again when the server lost its data', async () => {
    await toggleTick('2026-11-04', 'skin')
    await syncNow()
    server.lose()
    await syncNow()
    expect(server.has('entries', '2026-11-04|tick:skin')).toMatchObject({ value: true })
  })

  it("says when it can't reach the server, and keeps the changes for later", async () => {
    server.setOnline(false)
    await toggleTick('2026-11-05', 'skin')
    await syncNow()
    expect((await getSyncState()).error).toMatch('Couldn’t reach the server')
    expect(await dirtyCount()).toBe(1)
    server.setOnline(true)
    await syncNow()
    expect((await getSyncState()).error).toBeNull()
    expect(await dirtyCount()).toBe(0)
  })
})

describe('links and addresses', () => {
  it('carry the server and the key to another device', () => {
    const link = linkFor({ server: SERVER, key: 'k'.repeat(43) }, 'https://me.github.io/planner/#/sync')
    expect(link.startsWith('https://me.github.io/planner/#/link/')).toBe(true)
    expect(readLink(link.split('#/link/')[1])).toEqual({ server: SERVER, key: 'k'.repeat(43) })
    expect(readLink('not-a-link')).toBeNull()
  })

  it('accept a pasted server address, but only a safe one', () => {
    expect(serverAddress('planner-sync.me.workers.dev/')).toBe('https://planner-sync.me.workers.dev')
    expect(serverAddress('http://localhost:8787')).toBe('http://localhost:8787')
    expect(serverAddress('http://example.com')).toBeNull()
    expect(serverAddress('javascript:alert(1)')).toBeNull()
  })
})

describe('the sync mark', () => {
  it('stays out of backups', async () => {
    await toggleTick('2026-11-02', 'skin')
    const backup = await exportBackup()
    expect(JSON.stringify(backup)).not.toContain(DIRTY)
  })

  it('is put on everything saved before sync existed', async () => {
    db.close()
    await Dexie.delete('planner-app')
    const before = new Dexie('planner-app')
    before.version(4).stores({ entries: 'id, date, key', meta: 'id' })
    await before.table('entries').put({ id: '2026-10-01|note', date: '2026-10-01', key: 'note', value: 'old', updatedAt: 5 })
    before.close()
    await db.open()
    expect(await db.entries.get('2026-10-01|note')).toMatchObject({ [DIRTY]: 1 })
  })
})
