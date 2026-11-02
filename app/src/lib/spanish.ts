// Spanish: Dreaming Spanish minutes, book sessions, reading and exercises (PLAN.md 7.5), each
// with notes on what you did (F31).
import { db, type SpanishLog } from './db'
import { getSetting, setEntry } from './repo'
import { DEFAULT_SPANISH, DS_LEVELS, type SpanishSettings } from './setup'
import { alive, newId, now, softDelete, update } from './store'

/** The kinds of practice logged from Today's Spanish floor. */
export type DailyKind = 'video' | 'reading' | 'exercise'

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

export type SpanishLogChanges = Partial<Pick<SpanishLog, 'minutes' | 'pages' | 'title' | 'notes' | 'unit'>>

/** Saves the minutes, pages or notes written on Today for that day. */
export async function saveDayLog(date: string, kind: DailyKind, changes: SpanishLogChanges): Promise<void> {
  const id = dayLogId(date, kind)
  const existing = await db.spanishLogs.get(id)
  await db.spanishLogs.put({
    minutes: null,
    unit: null,
    pages: null,
    title: '',
    notes: '',
    ...existing,
    ...changes,
    id,
    date,
    kind,
    deleted: false,
    updatedAt: now(),
  })
}

/** Adds a video, reading or exercises from the Spanish screen. It counts as Spanish for that day (F5). */
export async function addSpanishLog(
  date: string,
  kind: DailyKind,
  fields: { minutes?: number | null; pages?: number | null; title?: string; notes?: string },
): Promise<void> {
  await db.spanishLogs.put({
    id: newId(),
    date,
    kind,
    minutes: fields.minutes ?? null,
    unit: null,
    pages: fields.pages ?? null,
    title: fields.title ?? '',
    notes: fields.notes ?? '',
    updatedAt: now(),
  })
  await setEntry(date, 'tick:spanish', true)
}

export const updateSpanishLog = (id: string, changes: SpanishLogChanges) => update(db.spanishLogs, id, changes)
export const deleteSpanishLog = (id: string) => softDelete(db.spanishLogs, id)

export interface BookState {
  /** Review sessions still to do before new units (D38). */
  reviewLeft: number
  nextUnit: number
  unitsDone: number
}

/**
 * Where the book is. The next unit follows the highest one logged, so two sessions on the
 * same unit still lead to the one after it.
 */
export function bookState(logs: readonly SpanishLog[], settings: SpanishSettings): BookState {
  const sessions = logs.filter((log) => log.kind === 'book')
  const reviewsDone = sessions.filter((log) => log.unit === null).length
  const units = sessions.flatMap((log) => (log.unit === null ? [] : [log.unit])).filter((unit) => unit >= settings.startUnit)
  return {
    reviewLeft: Math.max(0, settings.reviewSessions - reviewsDone),
    nextUnit: units.length ? Math.max(...units) + 1 : settings.startUnit,
    unitsDone: new Set(units).size,
  }
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
  // Ticking again the same day brings back what you wrote.
  const earlier = await db.spanishLogs.get(id)
  await db.spanishLogs.put({
    id,
    date,
    kind: 'book',
    minutes: null,
    unit: state.reviewLeft > 0 ? null : state.nextUnit,
    pages: null,
    title: '',
    notes: earlier?.notes ?? '',
    updatedAt: now(),
  })
  await setEntry(date, 'tick:spanish-book', true)
}

/**
 * Logs or changes the day's book session: the unit (null for a review session) and what you
 * did. A new session starts as the next one in the book.
 */
export async function saveBookSession(date: string, changes: { unit?: number | null; notes?: string }): Promise<void> {
  const id = dayLogId(date, 'book')
  const existing = await db.spanishLogs.get(id)
  if (!existing || existing.deleted) await setBookSession(date, true)
  await update(db.spanishLogs, id, changes)
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
