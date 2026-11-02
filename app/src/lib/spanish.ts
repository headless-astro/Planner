// Spanish: Dreaming Spanish minutes, book sessions and reading (PLAN.md 7.5).
import { db, type SpanishLog } from './db'
import { getSetting, setEntry } from './repo'
import { DEFAULT_SPANISH, DS_LEVELS, type SpanishSettings } from './setup'
import { alive, newId, now, softDelete } from './store'

export const getSpanishSettings = () => getSetting<SpanishSettings>('spanish', DEFAULT_SPANISH)

export async function updateSpanishSettings(changes: Partial<SpanishSettings>): Promise<void> {
  await db.settings.put({ id: 'spanish', value: { ...(await getSpanishSettings()), ...changes }, updatedAt: now() })
}

/** Newest first. */
export async function listSpanishLogs(): Promise<SpanishLog[]> {
  return alive(await db.spanishLogs.toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)
}

export async function getDaySpanishLogs(date: string): Promise<SpanishLog[]> {
  return alive(await db.spanishLogs.where('date').equals(date).toArray())
}

/** Logs typed on Today get one record per day and kind: "<date>|video", "<date>|book"… */
const dayLogId = (date: string, kind: SpanishLog['kind']) => `${date}|${kind}`

/** Saves the minutes or pages noted on Today for that day. */
export async function saveDayLog(date: string, kind: 'video' | 'reading', changes: { minutes?: number | null; pages?: number | null }): Promise<void> {
  const id = dayLogId(date, kind)
  const existing = await db.spanishLogs.get(id)
  await db.spanishLogs.put({ minutes: null, unit: null, pages: null, title: '', ...existing, ...changes, id, date, kind, deleted: false, updatedAt: now() })
}

/** Adds a video or reading from the Spanish screen. Logging counts as Spanish for that day (F5). */
export async function addSpanishLog(
  date: string,
  kind: 'video' | 'reading',
  fields: { minutes?: number | null; pages?: number | null; title?: string },
): Promise<void> {
  await db.spanishLogs.put({
    id: newId(),
    date,
    kind,
    minutes: fields.minutes ?? null,
    unit: null,
    pages: fields.pages ?? null,
    title: fields.title ?? '',
    updatedAt: now(),
  })
  await setEntry(date, 'tick:spanish', true)
}

export const deleteSpanishLog = (id: string) => softDelete(db.spanishLogs, id)

export interface BookState {
  /** Review sessions still to do before new units (D38). */
  reviewLeft: number
  nextUnit: number
  unitsDone: number
}

export function bookState(logs: readonly SpanishLog[], settings: SpanishSettings): BookState {
  const sessions = logs.filter((log) => log.kind === 'book')
  const reviewsDone = sessions.filter((log) => log.unit === null).length
  const unitsDone = sessions.length - reviewsDone
  return { reviewLeft: Math.max(0, settings.reviewSessions - reviewsDone), nextUnit: settings.startUnit + unitsDone, unitsDone }
}

/** "review session 1 of 2" or "unit 3". */
export function nextBookSession(state: BookState, settings: SpanishSettings): string {
  return state.reviewLeft > 0 ? `review session ${settings.reviewSessions - state.reviewLeft + 1} of ${settings.reviewSessions}` : `unit ${state.nextUnit}`
}

/** What a logged book session was. */
export const bookSessionLabel = (log: SpanishLog) => (log.unit === null ? 'review session' : `unit ${log.unit}`)

/** Logs the day's book session (a review or the next unit), or removes it. The Spanish-book tick follows. */
export async function setBookSession(date: string, done: boolean): Promise<void> {
  const id = dayLogId(date, 'book')
  if (!done) {
    await softDelete(db.spanishLogs, id)
    await setEntry(date, 'tick:spanish-book', false)
    return
  }
  const others = (await listSpanishLogs()).filter((log) => log.id !== id)
  const state = bookState(others, await getSpanishSettings())
  await db.spanishLogs.put({
    id,
    date,
    kind: 'book',
    minutes: null,
    unit: state.reviewLeft > 0 ? null : state.nextUnit,
    pages: null,
    title: '',
    updatedAt: now(),
  })
  await setEntry(date, 'tick:spanish-book', true)
}

export const videoMinutes = (logs: readonly SpanishLog[]) =>
  logs.filter((log) => log.kind === 'video').reduce((sum, log) => sum + (log.minutes ?? 0), 0)

export interface DsProgress {
  hours: number
  level: number
  nextLevel: number | null
  hoursToNext: number | null
}

/** Where total Dreaming Spanish input puts you on its level markers. */
export function dsProgress(totalMinutes: number): DsProgress {
  const hours = totalMinutes / 60
  const reached = DS_LEVELS.filter((step) => hours >= step.hours)
  const next = DS_LEVELS.find((step) => hours < step.hours) ?? null
  return {
    hours,
    level: reached.at(-1)?.level ?? 1,
    nextLevel: next?.level ?? null,
    hoursToNext: next ? next.hours - hours : null,
  }
}
