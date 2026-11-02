// Crunch days: busy stretches that are left out of weekly targets (PLAN.md D20).
// Anything still logged on a crunch day counts; nothing counts against you.
import { addDays, parseDate, toISODate } from './dates'
import { db, type Crunch } from './db'
import { alive, newId, now, softDelete } from './store'

export async function listCrunches(): Promise<Crunch[]> {
  return alive(await db.crunches.toArray()).sort((a, b) => a.start.localeCompare(b.start))
}

export function isCrunchDay(crunches: readonly Crunch[], date: string): boolean {
  return crunches.some((crunch) => crunch.start <= date && (crunch.end === null || date <= crunch.end))
}

/** How many days from `from` to `to`, both included, are crunch days. */
export function countCrunchDays(crunches: readonly Crunch[], from: string, to: string): number {
  let count = 0
  for (let day = parseDate(from); toISODate(day) <= to; day = addDays(day, 1)) {
    if (isCrunchDay(crunches, toISODate(day))) count++
  }
  return count
}

/** Starts crunch days from a date, until they're ended. */
export async function startCrunch(date: string): Promise<void> {
  await db.crunches.put({ id: newId(), start: date, end: null, updatedAt: now() })
}

/** Ends the crunch that's still on. The given day still counts as a crunch day. */
export async function endCrunch(date: string): Promise<void> {
  for (const crunch of await listCrunches()) {
    if (crunch.end === null && crunch.start <= date) await db.crunches.put({ ...crunch, end: date, updatedAt: now() })
  }
}

export const deleteCrunch = (id: string) => softDelete(db.crunches, id)
