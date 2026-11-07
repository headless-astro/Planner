// Sync (PLAN.md 11.4): a device sends its changes and gets back everything newer than its
// cursor. The newer updatedAt wins; on a tie, what's stored stays.
import { HttpError, isObject, type Env } from './http'

/** Changes a device can send in one request, and records it gets back per request. */
export const MAX_CHANGES = 500
export const PAGE_SIZE = 500
const MAX_RECORD = 100_000
const TABLE_NAME = /^[A-Za-z][A-Za-z0-9]{0,39}$/

export interface SyncRecord {
  id: string
  updatedAt: number
  [field: string]: unknown
}

export interface Change {
  table: string
  record: SyncRecord
}

export interface SyncResponse {
  cursor: number
  changes: Change[]
  /** More changes are waiting: ask again with the new cursor. */
  more: boolean
  /** How many of the sent changes were newer than what the server had. */
  accepted: number
  /** The server's data was reset: start over from cursor 0 and send everything again. */
  reset: boolean
}

function parse(body: unknown): { cursor: number; changes: Change[] } {
  if (!isObject(body)) throw new HttpError(400, 'Expected { cursor, changes }.')
  const { cursor, changes } = body
  if (typeof cursor !== 'number' || !Number.isSafeInteger(cursor) || cursor < 0) throw new HttpError(400, 'The cursor must be a whole number.')
  if (!Array.isArray(changes)) throw new HttpError(400, 'Changes must be a list.')
  if (changes.length > MAX_CHANGES) throw new HttpError(413, `At most ${MAX_CHANGES} changes at once.`)
  return {
    cursor,
    changes: changes.map((change: unknown) => {
      if (!isObject(change) || typeof change.table !== 'string' || !TABLE_NAME.test(change.table) || !isObject(change.record)) {
        throw new HttpError(400, 'Each change needs a table and a record.')
      }
      const { id, updatedAt } = change.record
      if (typeof id !== 'string' || !id || id.length > 200) throw new HttpError(400, 'Each record needs an id.')
      if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt < 0) throw new HttpError(400, 'Each record needs updatedAt.')
      return { table: change.table, record: change.record as SyncRecord }
    }),
  }
}

/** Syncs within one space: each person's records are kept apart (D72). */
export async function sync(env: Env, space: string, body: unknown): Promise<SyncResponse> {
  const { cursor, changes } = parse(body)

  // A cursor past the newest change means the database was reset since the device last synced.
  const latest = (await env.DB.prepare('SELECT COALESCE(MAX(seq), 0) AS latest FROM records WHERE space = ?1').bind(space).first<number>('latest')) ?? 0
  if (cursor > latest) return { cursor: 0, changes: [], more: false, accepted: 0, reset: true }

  let accepted = 0
  if (changes.length) {
    const rows = changes.map(({ table, record }) => {
      const data = JSON.stringify(record)
      if (data.length > MAX_RECORD) throw new HttpError(413, 'A record is too big.')
      return { t: table, i: record.id, u: record.updatedAt, d: data }
    })
    // One statement for the whole batch. Each accepted change gets a sequence number above
    // every earlier one (across all spaces), so devices pick it up after their cursor.
    const result = await env.DB.prepare(
      `INSERT INTO records (space, tbl, id, updated_at, seq, data)
       SELECT ?2, value ->> '$.t', value ->> '$.i', value ->> '$.u', (SELECT COALESCE(MAX(seq), 0) FROM records) + key + 1, value ->> '$.d'
       FROM json_each(?1) WHERE true
       ON CONFLICT (space, tbl, id) DO UPDATE SET updated_at = excluded.updated_at, seq = excluded.seq, data = excluded.data
       WHERE excluded.updated_at > records.updated_at`,
    )
      .bind(JSON.stringify(rows), space)
      .run()
    accepted = result.meta.changes
  }

  const { results } = await env.DB.prepare('SELECT tbl, seq, data FROM records WHERE space = ?3 AND seq > ?1 ORDER BY seq LIMIT ?2')
    .bind(cursor, PAGE_SIZE + 1, space)
    .all<{ tbl: string; seq: number; data: string }>()
  const page = results.slice(0, PAGE_SIZE)
  return {
    cursor: page.length ? page[page.length - 1].seq : cursor,
    changes: page.map((row) => ({ table: row.tbl, record: JSON.parse(row.data) as SyncRecord })),
    more: results.length > PAGE_SIZE,
    accepted,
    reset: false,
  }
}
