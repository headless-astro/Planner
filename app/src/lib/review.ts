// The Sunday review: one week on one screen (PLAN.md S12, F9).
import { countCrunchDays, listCrunches } from './crunch'
import { addDays, parseDate, toISODate } from './dates'
import { db } from './db'
import { getEntriesBetween, getTargets, listHabits } from './repo'
import { videoMinutes } from './spanish'
import { alive } from './store'
import { weekCounters, type Counter } from './week'

export interface WeekReview {
  monday: string
  sunday: string
  counters: Counter[]
  crunchDays: number
  studySessions: number
  spanishMinutes: number
  routinesDone: number
  tasksDone: number
  /** Average of the days rated 1–3. */
  workAverage: number | null
  weighIns: { date: string; value: number }[]
  notes: string
}

/** Work ratings 1–3 as numbers; "–" (nothing done) isn't a rating. */
export const workRatings = (values: unknown[]) => values.map(Number).filter((value) => value >= 1 && value <= 3)

export async function getWeekReview(monday: string): Promise<WeekReview> {
  const sunday = toISODate(addDays(parseDate(monday), 6))
  const inWeek = (date: string | null) => date !== null && date >= monday && date <= sunday
  const [entries, habits, targets, crunches, topics, spanishLogs, routineLogs, finished, measurements] = await Promise.all([
    getEntriesBetween(monday, sunday),
    listHabits(),
    getTargets(),
    listCrunches(),
    db.topics.toArray(),
    db.spanishLogs.where('date').between(monday, sunday, true, true).toArray(),
    db.routineLogs.where('date').between(monday, sunday, true, true).toArray(),
    db.tasks.where('doneDate').between(monday, sunday, true, true).toArray(),
    db.measurements.where('date').between(monday, sunday, true, true).toArray(),
  ])
  const crunchDays = countCrunchDays(crunches, monday, sunday)
  const ratings = workRatings(entries.filter((entry) => entry.key === 'work').map((entry) => entry.value))
  const notes = entries.find((entry) => entry.date === monday && entry.key === 'review')?.value
  return {
    monday,
    sunday,
    counters: weekCounters(entries, habits, targets, crunchDays),
    crunchDays,
    studySessions: alive(topics).filter((topic) => inWeek(topic.doneDate)).length,
    spanishMinutes: videoMinutes(alive(spanishLogs)),
    routinesDone: alive(routineLogs).length,
    tasksDone: alive(finished).filter((task) => task.done).length,
    workAverage: ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null,
    weighIns: alive(measurements)
      .filter((row) => row.kind === 'weight')
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => ({ date: row.date, value: row.value })),
    notes: typeof notes === 'string' ? notes : '',
  }
}

/** The Mondays of the weeks whose review has notes. */
export async function listReviewedWeeks(): Promise<string[]> {
  const rows = alive(await db.entries.where('key').equals('review').toArray())
  return rows.filter((row) => typeof row.value === 'string' && row.value.trim()).map((row) => row.date)
}
