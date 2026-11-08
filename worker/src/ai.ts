// Connecting an AI (F74, D89): the app sends its week-by-week summary here while "Connect an AI"
// is on, and the connector reads it. Saved analyses go into the space's synced records, so they
// reach every device like anything else. Turning it off deletes the summary and every sign-in.
import type { AnalysisWeek } from '../../app/src/lib/analysisText'
import { sha256Hex } from './auth'
import { HttpError, isObject, type Env } from './http'
import { localClock } from './reminders'

/** A sign-in code works once, for 10 minutes. */
export const CODE_MINUTES = 10
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const WEEK = /^\d{4}-\d{2}-\d{2}$/
/** Generous: a week with a long food diary every day is still far under this. */
const MAX_WEEK = 200_000
const MAX_WEEKS = 600
const CONTEXT = 'context'

export interface AiContext {
  guidelines?: string[]
  /** When the app put the summary together. */
  generatedAt?: string
}

/** Whether "Connect an AI" is on in this space's settings (off unless turned on). */
export async function aiIsOn(env: Env, space: string): Promise<boolean> {
  const data = await env.DB.prepare("SELECT data FROM records WHERE space = ?1 AND tbl = 'settings' AND id = 'ai'").bind(space).first<string>('data')
  if (!data) return false
  const record = JSON.parse(data) as { value?: { connect?: unknown }; deleted?: boolean }
  return !record.deleted && record.value?.connect === true
}

async function requireAiOn(env: Env, space: string): Promise<void> {
  if (!(await aiIsOn(env, space))) throw new HttpError(403, 'Connecting an AI is turned off. Turn it on in the app, then sync.')
}

/** The app sends the weeks that changed, the list of every week it has, and the context. */
export async function storeWeeks(env: Env, space: string, body: unknown, now = Date.now()): Promise<{ stored: number }> {
  if (!isObject(body) || !Array.isArray(body.weeks)) throw new HttpError(400, 'Expected { weeks }.')
  await requireAiOn(env, space)
  if (body.weeks.length > MAX_WEEKS) throw new HttpError(413, 'Too many weeks at once.')
  const rows = body.weeks.map((week: unknown) => {
    if (!isObject(week) || typeof week.monday !== 'string' || !WEEK.test(week.monday) || !isObject(week.data)) throw new HttpError(400, 'Each week needs a Monday and its data.')
    const data = JSON.stringify(week.data)
    if (data.length > MAX_WEEK) throw new HttpError(413, 'A week is too big.')
    return { w: week.monday, d: data }
  })
  if (isObject(body.context)) {
    const guidelines = Array.isArray(body.context.guidelines) ? body.context.guidelines.filter((line): line is string => typeof line === 'string').slice(0, 50) : []
    const generatedAt = typeof body.context.generatedAt === 'string' ? body.context.generatedAt.slice(0, 40) : new Date(now).toISOString()
    rows.push({ w: CONTEXT, d: JSON.stringify({ guidelines, generatedAt } satisfies AiContext) })
  }
  if (rows.length) {
    await env.DB.prepare(
      `INSERT INTO ai_weeks (space, week, data, updated_at)
       SELECT ?1, value ->> '$.w', value ->> '$.d', ?3 FROM json_each(?2) WHERE true
       ON CONFLICT (space, week) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
      .bind(space, JSON.stringify(rows), now)
      .run()
  }
  // Weeks the app no longer has (everything in them was deleted) go too.
  if (Array.isArray(body.keep)) {
    const keep = body.keep.filter((monday): monday is string => typeof monday === 'string' && WEEK.test(monday))
    await env.DB.prepare(`DELETE FROM ai_weeks WHERE space = ?1 AND week != '${CONTEXT}' AND week NOT IN (SELECT value FROM json_each(?2))`)
      .bind(space, JSON.stringify(keep))
      .run()
  }
  return { stored: rows.length }
}

/** The latest weeks (oldest first), up to `count`, and the context. */
export async function loadWeeks(env: Env, space: string, count: number): Promise<{ weeks: AnalysisWeek[]; context: AiContext }> {
  const { results } = await env.DB.prepare(`SELECT data FROM ai_weeks WHERE space = ?1 AND week != '${CONTEXT}' ORDER BY week DESC LIMIT ?2`)
    .bind(space, count)
    .all<{ data: string }>()
  const context = await env.DB.prepare(`SELECT data FROM ai_weeks WHERE space = ?1 AND week = '${CONTEXT}'`).bind(space).first<string>('data')
  return {
    weeks: results.map((row) => JSON.parse(row.data) as AnalysisWeek).reverse(),
    context: context ? (JSON.parse(context) as AiContext) : {},
  }
}

/** Turning it off: the summary, unused codes and every connector sign-in for this space go. */
export async function clearAi(env: Env, space: string): Promise<{ signedOut: number }> {
  await env.DB.prepare('DELETE FROM ai_weeks WHERE space = ?1').bind(space).run()
  await env.DB.prepare('DELETE FROM ai_codes WHERE space = ?1').bind(space).run()
  let signedOut = 0
  const oauth = env.OAUTH_PROVIDER
  if (oauth) {
    let cursor: string | undefined
    do {
      const page = await oauth.listUserGrants(space, { cursor })
      for (const grant of page.items) {
        await oauth.revokeGrant(grant.id, space)
        signedOut++
      }
      cursor = page.cursor
    } while (cursor)
  }
  return { signedOut }
}

/** A one-time code to type on the connector's sign-in page. */
export async function createCode(env: Env, space: string, now = Date.now()): Promise<{ code: string; expires: number }> {
  if (!env.OAUTH_KV) throw new HttpError(503, 'The server needs an update before an AI can connect.')
  await requireAiOn(env, space)
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const code = [...bytes].map((byte) => CODE_LETTERS[byte % CODE_LETTERS.length]).join('')
  const expires = now + CODE_MINUTES * 60_000
  await env.DB.prepare('DELETE FROM ai_codes WHERE expires <= ?1').bind(now).run()
  await env.DB.prepare('INSERT INTO ai_codes (code_hash, space, expires) VALUES (?1, ?2, ?3)').bind(await sha256Hex(code), space, expires).run()
  return { code, expires }
}

/** The space a code belongs to, using it up; null if it's wrong, used or too old. */
export async function useCode(env: Env, typed: string, now = Date.now()): Promise<string | null> {
  const code = typed.replace(/[\s-]/g, '').toUpperCase()
  if (!/^[A-Z0-9]{8}$/.test(code)) return null
  const row = await env.DB.prepare('DELETE FROM ai_codes WHERE code_hash = ?1 AND expires > ?2 RETURNING space')
    .bind(await sha256Hex(code), now)
    .first<string>('space')
  if (!row || !(await aiIsOn(env, row))) return null
  return row
}

// ── Saved analyses (F75): records in the synced table "analyses" ──

export interface SavedAnalysis {
  id: string
  updatedAt: number
  date: string
  title: string
  text: string
  source: 'connector' | 'pasted'
  by?: string
  deleted?: boolean
}

export const MAX_TITLE = 120
export const MAX_TEXT = 60_000

/** Today in the space's time zone (from its devices' reminders), else in UTC. */
async function todayFor(env: Env, space: string, now: number): Promise<string> {
  const timeZone = await env.DB.prepare('SELECT timezone FROM subscriptions WHERE space = ?1 LIMIT 1').bind(space).first<string>('timezone')
  try {
    if (timeZone) return localClock(new Date(now), timeZone).date
  } catch {
    // An unknown time zone: UTC instead.
  }
  return new Date(now).toISOString().slice(0, 10)
}

export async function saveAnalysis(env: Env, space: string, input: { title: string; text: string; by?: string }, now = Date.now()): Promise<SavedAnalysis> {
  const title = input.title.trim().slice(0, MAX_TITLE) || 'Analysis'
  const text = input.text.trim()
  if (!text) throw new HttpError(400, 'The analysis is empty.')
  if (text.length > MAX_TEXT) throw new HttpError(413, `An analysis can be at most ${MAX_TEXT} characters.`)
  const record: SavedAnalysis = { id: `ai-${crypto.randomUUID()}`, updatedAt: now, date: await todayFor(env, space, now), title, text, source: 'connector' }
  if (input.by) record.by = input.by.slice(0, 60)
  // A sequence number above every earlier change, so each device picks it up on its next sync.
  await env.DB.prepare(
    "INSERT INTO records (space, tbl, id, updated_at, seq, data) VALUES (?1, 'analyses', ?2, ?3, (SELECT COALESCE(MAX(seq), 0) + 1 FROM records), ?4)",
  )
    .bind(space, record.id, record.updatedAt, JSON.stringify(record))
    .run()
  return record
}

export async function listAnalyses(env: Env, space: string, limit = 30): Promise<SavedAnalysis[]> {
  const { results } = await env.DB.prepare("SELECT data FROM records WHERE space = ?1 AND tbl = 'analyses'").bind(space).all<{ data: string }>()
  return results
    .map((row) => JSON.parse(row.data) as SavedAnalysis)
    .filter((row) => !row.deleted)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)
    .slice(0, limit)
}

export async function readAnalysis(env: Env, space: string, id: string): Promise<SavedAnalysis | null> {
  const data = await env.DB.prepare("SELECT data FROM records WHERE space = ?1 AND tbl = 'analyses' AND id = ?2").bind(space, id).first<string>('data')
  const record = data ? (JSON.parse(data) as SavedAnalysis) : null
  return record && !record.deleted ? record : null
}
