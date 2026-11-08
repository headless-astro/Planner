// Sync with your server (PLAN.md 11.4, 12.6): this device's changes go up, the other devices'
// changes come down, and the newer change wins. The server's address and the key are kept on
// this device only (the meta table), never synced or exported.
import { db, DIRTY, FROM_SYNC, onLocalChange, SYNCED_TABLES, type Synced, type SyncedTableName } from './db'
import { getMeta, setMeta } from './repo'

export interface SyncConfig {
  /** The Worker's address, like https://planner-sync.name.workers.dev */
  server: string
  key: string
}

export interface SyncState {
  config: SyncConfig | null
  lastSync: number | null
  error: string | null
}

const CONFIG = 'sync'
const CURSOR = 'syncCursor'
const LAST = 'syncLast'
const ERROR = 'syncError'

/** As many changes as the server takes in one request. */
const BATCH = 500

type Row = Synced & Record<string, unknown>

interface Change {
  table: string
  record: Row
}

interface SyncResponse {
  cursor: number
  changes: Change[]
  more: boolean
  accepted: number
  reset: boolean
}

export class SyncError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message)
  }
}

export const getSyncConfig = async () => (await getMeta<SyncConfig>(CONFIG)) ?? null

export async function getSyncState(): Promise<SyncState> {
  const [config, lastSync, error] = await Promise.all([getSyncConfig(), getMeta<number>(LAST), getMeta<string>(ERROR)])
  return { config, lastSync: lastSync ?? null, error: error ?? null }
}

// ── Talking to the server ──

/** Sends a request to the server with the key, and turns failures into plain messages. */
export async function serverCall<T>(config: SyncConfig, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${config.server}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? { Authorization: `Bearer ${config.key}` } : { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new SyncError('Couldn’t reach the server. It tries again when you’re back online.')
  }
  const data = (await response.json().catch(() => ({}))) as { error?: unknown }
  if (!response.ok) {
    throw new SyncError(typeof data.error === 'string' ? data.error : `The server answered with an error (${response.status}).`, response.status)
  }
  return data as T
}

/** The server's address from what was typed or pasted, or null if it isn't one. */
export function serverAddress(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null
  return url.origin
}

// ── Keys and links ──

export function base64url(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

/** A new secret key: 32 random bytes (D47). */
export const newKey = () => base64url(crypto.getRandomValues(new Uint8Array(32)))

const KEY_FORMAT = /^[A-Za-z0-9_-]{32,128}$/

/**
 * The link that connects another device: the app's address with the server and key after #.
 * It also says whether the device it came from has the original setup ("mine"), so the new
 * device sets up the same way: starting records that never changed aren't on the server.
 */
export function linkFor(config: SyncConfig, appAddress: string, mine = true): string {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ s: config.server, k: config.key, ...(mine ? {} : { m: 'own' }) })))
  return `${appAddress.split('#')[0]}#/link/${payload}`
}

/** The server and key in a link's payload, or null if it's damaged. Links from before are "mine". */
export function readLink(payload: string): (SyncConfig & { mine: boolean }) | null {
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as { s?: unknown; k?: unknown; m?: unknown }
    const server = typeof data.s === 'string' ? serverAddress(data.s) : null
    return server && typeof data.k === 'string' && KEY_FORMAT.test(data.k) ? { server, key: data.k, mine: data.m !== 'own' } : null
  } catch {
    return null
  }
}

// ── Inviting someone (F66, D72): their own space on the same server ──

const INVITE_FORMAT = /^[A-Za-z2-9]{12}$/

export interface Invite {
  server: string
  code: string
}

/** The link that lets someone join: the app's address with the server and a one-time code. */
export function inviteLinkFor(invite: Invite, appAddress: string): string {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ s: invite.server, i: invite.code })))
  return `${appAddress.split('#')[0]}#/join/${payload}`
}

/** The server and code in an invite link, or null if it's damaged. */
export function readInvite(payload: string): Invite | null {
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as { s?: unknown; i?: unknown }
    const server = typeof data.s === 'string' ? serverAddress(data.s) : null
    return server && typeof data.i === 'string' && INVITE_FORMAT.test(data.i) ? { server, code: data.i.toUpperCase() } : null
  } catch {
    return null
  }
}

/** Whether this device's key owns the server, so it can invite people. */
export async function isServerOwner(config: SyncConfig): Promise<boolean> {
  try {
    return (await serverCall<{ owner?: boolean }>(config, '/me')).owner === true
  } catch {
    return false
  }
}

/** A new one-time invite, valid for a week (owner only). */
export async function createInvite(config: SyncConfig): Promise<{ code: string; expires: number }> {
  return serverCall<{ code: string; expires: number }>(config, '/invite', {})
}

// ── Connecting ──

/**
 * Connects this device. The first device claims the server with a new key; the others bring
 * the key in their link; someone new brings an invite and gets their own space with a new key.
 * Everything on this device then goes up to the server once.
 */
export async function connect(address: string, key = newKey(), invite?: string): Promise<void> {
  const server = serverAddress(address)
  if (!server) throw new SyncError('That isn’t a web address. It should look like https://planner-sync.name.workers.dev')
  const config = { server, key }
  const status = await serverCall<{ app?: string }>(config, '/')
  if (status.app !== 'planner-sync') throw new SyncError('That address isn’t a planner server.')
  try {
    await serverCall(config, '/claim', invite ? { invite } : {})
  } catch (error) {
    if (error instanceof SyncError && error.status === 403) {
      throw new SyncError('That invite has been used or has run out. Ask for a new one.', 403)
    }
    if (error instanceof SyncError && error.status === 409) {
      throw new SyncError('This server is already connected to your other device. Open the link from “Add another device” there instead.', 409)
    }
    throw error
  }
  await setMeta(CONFIG, config)
  await setMeta(CURSOR, 0)
  await markAllDirty()
  await syncNow()
}

/** Stops syncing on this device. The data stays here and on the server. */
export async function disconnect(): Promise<void> {
  await db.meta.bulkDelete([CONFIG, CURSOR, LAST, ERROR])
}

// ── Syncing ──

const clean = (row: Row): Row => {
  const { [DIRTY]: _dirty, [FROM_SYNC]: _fromSync, ...record } = row
  return record as Row
}

/** Up to `limit` records this device changed that the server doesn't have yet. */
async function changedRecords(limit: number): Promise<{ table: SyncedTableName; record: Row }[]> {
  const found: { table: SyncedTableName; record: Row }[] = []
  for (const table of SYNCED_TABLES) {
    if (found.length >= limit) break
    const rows = await db
      .table<Row, string>(table)
      .where(DIRTY)
      .equals(1)
      .limit(limit - found.length)
      .toArray()
    for (const record of rows) found.push({ table, record })
  }
  return found
}

/** Marks every record to be sent again: on connecting, and when the server was reset. */
async function markAllDirty(): Promise<void> {
  for (const name of SYNCED_TABLES) {
    await db
      .table<Row, string>(name)
      .toCollection()
      .modify((row) => {
        if (row.updatedAt > 0) row[DIRTY] = 1
      })
  }
}

/** Saves the other devices' changes here, where they're newer than what this device has. */
async function applyRemote(changes: Change[]): Promise<void> {
  const known = new Set<string>(SYNCED_TABLES)
  const byTable = new Map<SyncedTableName, Row[]>()
  for (const { table, record } of changes) {
    // A table from a newer version of the app waits until this device updates.
    if (!known.has(table)) continue
    const name = table as SyncedTableName
    byTable.set(name, [...(byTable.get(name) ?? []), clean(record)])
  }
  if (!byTable.size) return
  await db.transaction(
    'rw',
    [...byTable.keys()].map((name) => db.table(name)),
    async () => {
      for (const [name, records] of byTable) {
        const table = db.table<Row, string>(name)
        const current = await table.bulkGet(records.map((record) => record.id))
        const newer = records.filter((record, index) => {
          const here = current[index]
          return !here || here.updatedAt < record.updatedAt
        })
        if (newer.length) await table.bulkPut(newer.map((record) => ({ ...record, [FROM_SYNC]: true })))
      }
    },
  )
}

/** Clears the mark on records the server now has. A change made meanwhile keeps its mark. */
async function markSent(sent: { table: SyncedTableName; record: Row }[]): Promise<void> {
  if (!sent.length) return
  const names = [...new Set(sent.map(({ table }) => table))]
  await db.transaction(
    'rw',
    names.map((name) => db.table(name)),
    async () => {
      for (const { table, record } of sent) {
        const here = await db.table<Row, string>(table).get(record.id)
        if (here?.[DIRTY] && here.updatedAt === record.updatedAt) {
          await db.table<Row, string>(table).update(record.id, { [DIRTY]: undefined, [FROM_SYNC]: true })
        }
      }
    },
  )
}

async function syncOnce(): Promise<void> {
  let config: SyncConfig | null
  try {
    config = await getSyncConfig()
  } catch {
    // The database is closing, for example while the app shuts down.
    return
  }
  if (!config) return
  try {
    let cursor = (await getMeta<number>(CURSOR)) ?? 0
    // Bounded, so a misbehaving server can't keep it going forever.
    for (let round = 0; round < 200; round++) {
      const outgoing = await changedRecords(BATCH)
      const response = await serverCall<SyncResponse>(config, '/sync', {
        cursor,
        changes: outgoing.map(({ table, record }) => ({ table, record: clean(record) })),
      })
      if (response.reset) {
        // The server lost its data: send everything again.
        await markAllDirty()
        cursor = 0
        await setMeta(CURSOR, 0)
        continue
      }
      await applyRemote(response.changes)
      await markSent(outgoing)
      cursor = response.cursor
      await setMeta(CURSOR, cursor)
      if (!response.more && outgoing.length < BATCH) break
    }
    await setMeta(LAST, Date.now())
    await db.meta.delete(ERROR)
    synced?.()
  } catch (error) {
    await setMeta(ERROR, error instanceof Error ? error.message : String(error)).catch(() => undefined)
  }
}

let synced: (() => void) | null = null

/** Runs after each sync that worked. The AI summary (F74) goes up after it. */
export function onSynced(listener: (() => void) | null): void {
  synced = listener
}

let running: Promise<void> | null = null
let again = false

/** Syncs now. If a sync is already running, one more follows it. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        await syncOnce()
      } while (again)
    } finally {
      running = null
    }
  })()
  return running
}

let timer: ReturnType<typeof setTimeout> | undefined

/** Syncs a few seconds after the last change, so a burst of ticks goes up together. */
export function scheduleSync(delay = 3000): void {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delay)
}

let started = false

/** Starts syncing: now, after changes, when the app comes back into view or back online, and every few minutes. */
export function startSync(): void {
  if (started) return
  started = true
  onLocalChange(() => scheduleSync())
  void syncNow()
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow()
  }, 5 * 60_000)
}
