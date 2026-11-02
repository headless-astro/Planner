// Stats: the spreadsheet's Dashboard, worked out from everything saved (F10).
import { countCrunchDays, isCrunchDay, listCrunches } from './crunch'
import { addDays, daysBetween, parseDate, toISODate, weekStart } from './dates'
import { db } from './db'
import { getEntriesBetween, getTargets, listHabits } from './repo'
import { workRatings } from './review'
import { videoMinutes } from './spanish'
import { alive } from './store'
import { weekCounters, type Counter } from './week'

export interface Stats {
  /** The first day anything was logged. */
  since: string | null
  /** Days from then to today, leaving out crunch days with nothing logged (D20). */
  days: number
  /** Of those, the days with anything logged. */
  logged: number
  workAverage: number | null
  workDays: number
  /** The last 4 weeks, newest first. */
  weeks: { monday: string; counters: Counter[] }[]
  spanishHours: number
}

export async function getStats(today: string): Promise<Stats> {
  const [entries, snacks, measurements, tasks, routineLogs, sessions, spanishLogs, cooked, drawing, crafts, crunches, habits, targets] =
    await Promise.all([
      db.entries.toArray(),
      db.snacks.toArray(),
      db.measurements.toArray(),
      db.tasks.toArray(),
      db.routineLogs.toArray(),
      db.trackSessions.toArray(),
      db.spanishLogs.toArray(),
      db.cookedLogs.toArray(),
      db.drawingLogs.toArray(),
      db.craftLogs.toArray(),
      listCrunches(),
      listHabits(),
      getTargets(),
    ])

  // A day counts as logged when anything at all was saved for it (no check-in needed, D6).
  const loggedDates = new Set(
    [
      ...alive(entries).filter((entry) => entry.key !== 'review'),
      ...alive(snacks),
      ...alive(measurements),
      ...alive(routineLogs),
      ...alive(sessions),
      ...alive(spanishLogs),
      ...alive(cooked),
      ...alive(drawing),
      ...alive(crafts),
    ]
      .map((row) => row.date)
      .concat(alive(tasks).flatMap((task) => (task.done && task.doneDate ? [task.doneDate] : [])))
      .filter((date) => date <= today),
  )
  const since = [...loggedDates].sort()[0] ?? null

  let days = 0
  if (since) {
    for (let day = parseDate(since); toISODate(day) <= today; day = addDays(day, 1)) {
      const date = toISODate(day)
      if (loggedDates.has(date) || !isCrunchDay(crunches, date)) days++
    }
  }

  const ratings = workRatings(alive(entries).filter((entry) => entry.key === 'work').map((entry) => entry.value))

  const weeks = []
  for (let back = 0; back < 4; back++) {
    const monday = addDays(weekStart(parseDate(today)), -7 * back)
    const from = toISODate(monday)
    const to = toISODate(addDays(monday, 6))
    weeks.push({
      monday: from,
      counters: weekCounters(await getEntriesBetween(from, to), habits, targets, countCrunchDays(crunches, from, to)),
    })
  }

  return {
    since,
    days: since ? Math.max(days, 1) : 0,
    logged: loggedDates.size,
    workAverage: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null,
    workDays: ratings.length,
    weeks,
    spanishHours: videoMinutes(alive(spanishLogs)) / 60,
  }
}

/** Where the weight would be at the goal pace (D26), `date` days after the first weigh-in. */
export function goalWeight(start: { date: string; value: number }, date: string, perWeek: number): number {
  return start.value - (perWeek * daysBetween(parseDate(start.date), parseDate(date))) / 7
}
