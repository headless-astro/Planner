// Routines: things that repeat every few days, counted from the last time they were done
// (the spreadsheet's Maintenance sheet).
import { addDays, daysBetween, parseDate, toISODate } from './dates'
import { db, type Routine, type RoutineLog } from './db'
import { setEntry } from './repo'
import { CHORES_AREA } from './setup'
import { alive, listOrdered, newId, nextOrder, now, reorder, softDelete, update } from './store'

export interface RoutineStatus {
  routine: Routine
  /** The last time it was done, on or before the date. */
  lastDone: string | null
  nextDue: string | null
  /** Days from the date until it's due: 0 means due that day, negative means late. Null if never done. */
  dueIn: number | null
  doneThatDay: boolean
  count: number
  /** Average days between completions, once there are two. */
  averageGap: number | null
}

/** Where a routine stands on a date. */
export function routineStatus(routine: Routine, logs: readonly RoutineLog[], date: string): RoutineStatus {
  const dates = logs
    .filter((log) => log.routineId === routine.id && log.date <= date)
    .map((log) => log.date)
    .sort()
  const lastDone = dates.at(-1) ?? null
  const nextDue = lastDone ? toISODate(addDays(parseDate(lastDone), routine.intervalDays)) : null
  return {
    routine,
    lastDone,
    nextDue,
    dueIn: nextDue ? daysBetween(parseDate(date), parseDate(nextDue)) : null,
    doneThatDay: lastDone === date,
    count: dates.length,
    averageGap: lastDone && dates.length >= 2 ? daysBetween(parseDate(dates[0]), parseDate(lastDone)) / (dates.length - 1) : null,
  }
}

/** "done", "due today", "2 days late", "due in 3 days" or "not started". */
export function dueText(status: RoutineStatus): string {
  const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
  if (status.doneThatDay) return 'done'
  if (status.dueIn === null) return 'not started'
  if (status.dueIn === 0) return 'due today'
  if (status.dueIn < 0) return `${days(-status.dueIn)} late`
  return `due in ${days(status.dueIn)}`
}

export const listRoutines = () => listOrdered(db.routines)

export async function getRoutineStatuses(date: string): Promise<RoutineStatus[]> {
  const [routines, logs] = await Promise.all([listRoutines(), db.routineLogs.toArray()])
  const done = alive(logs)
  return routines.map((routine) => routineStatus(routine, done, date))
}

/** Marks a routine done on a date, or undoes that. Cleaning routines also tick Chores (D17). */
export async function setRoutineDone(routineId: string, date: string, done: boolean): Promise<void> {
  const id = `${routineId}|${date}`
  if (!done) return softDelete(db.routineLogs, id)
  await db.routineLogs.put({ id, routineId, date, updatedAt: now() })
  const routine = await db.routines.get(routineId)
  if (routine?.area === CHORES_AREA) await setEntry(date, 'tick:chores', true)
}

export async function addRoutine(name: string, area: string, intervalDays: number): Promise<void> {
  await db.routines.put({ id: newId(), name, area, intervalDays, order: await nextOrder(db.routines), updatedAt: now() })
}

export const updateRoutine = (id: string, changes: Partial<Pick<Routine, 'name' | 'area' | 'intervalDays'>>) =>
  update(db.routines, id, changes)
export const deleteRoutine = (id: string) => softDelete(db.routines, id)
export const moveRoutine = (id: string, step: -1 | 1) => reorder(db.routines, id, step)
