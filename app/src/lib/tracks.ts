// Short practice tracks, like a month of driving (F27). Each has fixed days, a focus per
// week, and a log per session; extra sessions on other days are welcome.
import { addDays, parseDate, toISODate } from './dates'
import { db, type Track, type TrackSession } from './db'
import { alive, listOrdered, newId, nextOrder, now, softDelete, update } from './store'

export const listTracks = () => listOrdered(db.tracks)

const sessionId = (trackId: string, date: string) => `${trackId}|${date}`

/** All sessions, newest first. */
export async function listSessions(): Promise<TrackSession[]> {
  return alive(await db.trackSessions.toArray()).sort((a, b) => b.date.localeCompare(a.date))
}

/** The sessions logged on a date, by track id. */
export async function getDaySessions(date: string): Promise<Record<string, TrackSession>> {
  const rows = alive(await db.trackSessions.where('date').equals(date).toArray())
  return Object.fromEntries(rows.map((row) => [row.trackId, row]))
}

/** Logs a session on a date, or removes it. */
export async function setSession(trackId: string, date: string, done: boolean): Promise<void> {
  if (!done) return softDelete(db.trackSessions, sessionId(trackId, date))
  await saveSession(trackId, date, {})
}

/** Logs a session, or changes its details. */
export async function saveSession(
  trackId: string,
  date: string,
  details: Partial<Pick<TrackSession, 'minutes' | 'practiced' | 'feeling'>>,
): Promise<void> {
  const id = sessionId(trackId, date)
  const existing = await db.trackSessions.get(id)
  await db.trackSessions.put({
    minutes: null,
    practiced: '',
    feeling: '',
    ...existing,
    ...details,
    id,
    trackId,
    date,
    deleted: false,
    updatedAt: now(),
  })
}

export async function addTrack(name: string, start: string, weeks: number, weekdays: number[]): Promise<void> {
  await db.tracks.put({ id: newId(), name, start, weeks, weekdays, focus: [], order: await nextOrder(db.tracks), updatedAt: now() })
}

export const updateTrack = (id: string, changes: Partial<Pick<Track, 'name' | 'start' | 'weeks' | 'weekdays' | 'focus'>>) =>
  update(db.tracks, id, changes)
export const deleteTrack = (id: string) => softDelete(db.tracks, id)

/** The last day of a track. */
export function trackEnd(track: Pick<Track, 'start' | 'weeks'>): string {
  return toISODate(addDays(parseDate(track.start), track.weeks * 7 - 1))
}
