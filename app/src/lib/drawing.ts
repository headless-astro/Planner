// The drawing study plan (PLAN.md 7.6, F18): areas with exercises and sources, one area a
// week on Friday mornings, and a log of sessions.
import { parseDate, toISODate, weekStart } from './dates'
import { db, type DrawingArea, type DrawingLog } from './db'
import { setEntry } from './repo'
import { alive, listOrdered, newId, nextOrder, now, reorder, softDelete, update } from './store'

export const listDrawingAreas = () => listOrdered(db.drawingAreas)

export async function addDrawingArea(name: string): Promise<void> {
  await db.drawingAreas.put({ id: newId(), name, exercises: [], sources: [], order: await nextOrder(db.drawingAreas), updatedAt: now() })
}

export const updateDrawingArea = (id: string, changes: Partial<Pick<DrawingArea, 'name' | 'exercises' | 'sources'>>) =>
  update(db.drawingAreas, id, changes)
export const deleteDrawingArea = (id: string) => softDelete(db.drawingAreas, id)
export const moveDrawingArea = (id: string, step: -1 | 1) => reorder(db.drawingAreas, id, step)

/** One entry per line of a text box, without the empty lines. */
export const textLines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

/** Newest first. */
export async function listDrawingLogs(): Promise<DrawingLog[]> {
  return alive(await db.drawingLogs.toArray()).sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * The area for a day's drawing session: the one logged that day, or else the area after the
 * last one you drew before that week. So a week keeps one area, and a missed week never
 * skips an area (rule 4).
 */
export function drawingAreaFor(areas: readonly DrawingArea[], logs: readonly DrawingLog[], date: string): DrawingArea | null {
  if (!areas.length) return null
  const logged = logs.find((log) => log.date === date)
  const loggedArea = logged && areas.find((area) => area.id === logged.areaId)
  if (loggedArea) return loggedArea
  const monday = toISODate(weekStart(parseDate(date)))
  const before = logs.filter((log) => log.date < monday).sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!before) return areas[0]
  // An area that was deleted since starts the rotation over.
  return areas[(areas.findIndex((area) => area.id === before.areaId) + 1) % areas.length]
}

const logId = (date: string) => `${date}|drawing`

export type DrawingLogChanges = Partial<Pick<DrawingLog, 'areaId' | 'exercise' | 'minutes' | 'note'>>

/** Logs the day's drawing session, or changes it. It ticks the drawing study slot for the day (F5). */
export async function saveDrawingLog(date: string, changes: DrawingLogChanges): Promise<void> {
  const id = logId(date)
  const existing = await db.drawingLogs.get(id)
  await db.drawingLogs.put({ areaId: '', exercise: '', minutes: null, note: '', ...existing, ...changes, id, date, deleted: false, updatedAt: now() })
  await setEntry(date, 'tick:drawing-study', true)
}

/** Removes the day's drawing session and its tick. */
export async function deleteDrawingLog(date: string): Promise<void> {
  await softDelete(db.drawingLogs, logId(date))
  await setEntry(date, 'tick:drawing-study', false)
}

/** Ticking Friday's slot on Today logs a session for the week's area; unticking removes it. */
export async function setDrawingSession(date: string, done: boolean, areaId: string | null): Promise<void> {
  if (done) await saveDrawingLog(date, areaId ? { areaId } : {})
  else await deleteDrawingLog(date)
}
