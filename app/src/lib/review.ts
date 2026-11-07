// The Sunday review: one week on one screen (PLAN.md S12, F9, F54).
import { countCrunchDays, listCrunches } from './crunch'
import { addDays, daysBetween, parseDate, toISODate, weekStart, weekdayIndex } from './dates'
import { db, type MediaItem } from './db'
import { habitRows, type HabitRow } from './insights'
import { ALL_FEATURES, type Features } from './features'
import { getEntriesBetween, getFeatures, getTargets, getTracking, getWeek, listDoses, listHabits } from './repo'
import { hoursOf, listTracks, stepsOf } from './tracks'
import { alive } from './store'
import { countText, workRatings } from './week'

/** The three short notes (F54), kept on the week's Monday. The old single note is "review". */
export const REVIEW_NOTES = [
  { key: 'review:well', label: 'What went well' },
  { key: 'review:hard', label: 'What was hard' },
  { key: 'review:next', label: 'One thing for next week' },
] as const
export type ReviewNoteKey = (typeof REVIEW_NOTES)[number]['key']

export interface WeekReview {
  /** What's turned on (F63). */
  features: Features
  monday: string
  sunday: string
  /** Each habit over this week and the 3 before it. */
  habits: HabitRow[]
  crunchDays: number
  /** Each track that had sessions this week (F69): days, minutes and steps done. */
  tracks: { id: string; name: string; days: number; minutes: number; steps: number }[]
  routinesDone: number
  tasksDone: number
  /** Average of the days rated 1–3. */
  workAverage: number | null
  energyAverage: number | null
  meds: { done: number; of: number }
  workouts: { done: number; planned: number }
  weighIns: { date: string; value: number }[]
  /** The week's last weigh-in against the last one before it. */
  weightChange: number | null
  /** Null when period tracking is off. */
  periodDays: number | null
  finished: MediaItem[]
  /** Filled in from the week (F54). */
  wentWell: string[]
  notes: Record<ReviewNoteKey, string>
  /** The single note from before the three boxes, if there is one. */
  oldNotes: string
  /** Last week's "One thing for next week". */
  lastWeekNext: string
  reviewed: boolean
}

const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export async function getWeekReview(monday: string, today: string): Promise<WeekReview> {
  const sunday = toISODate(addDays(parseDate(monday), 6))
  const lastMonday = toISODate(addDays(parseDate(monday), -7))
  const firstMonday = toISODate(addDays(parseDate(monday), -21))
  const thisMonday = toISODate(weekStart(parseDate(today)))
  const until = today < sunday ? today : sunday
  const inWeek = (date: string | null | undefined) => !!date && date >= monday && date <= sunday

  const [entries, habits, targets, crunches, topics, allSessions, routineLogs, finishedTasks, measurements, media, doses, week, tracking, first, tracks] =
    await Promise.all([
      getEntriesBetween(firstMonday, sunday),
      listHabits(),
      getTargets(),
      listCrunches(),
      db.topics.toArray(),
      db.trackSessions.where('date').between(firstMonday, sunday, true, true).toArray(),
      db.routineLogs.where('date').between(monday, sunday, true, true).toArray(),
      db.tasks.where('doneDate').between(monday, sunday, true, true).toArray(),
      db.measurements.toArray(),
      db.media.toArray(),
      listDoses(),
      getWeek(),
      getTracking(),
      db.entries.orderBy('date').first(),
      listTracks(),
    ])
  const sessions = alive(allSessions)
  const features = (await getFeatures()) ?? ALL_FEATURES
  const weekEntries = entries.filter((entry) => inWeek(entry.date))
  const valueOf = (date: string, key: string) => entries.find((entry) => entry.date === date && entry.key === key)?.value
  const text = (date: string, key: string) => {
    const value = valueOf(date, key)
    return typeof value === 'string' ? value : ''
  }

  // This week and the 3 before it; weeks before anything was logged stay blank.
  const habitWeeks = habitRows(
    entries,
    habits,
    targets,
    crunches,
    [firstMonday, toISODate(addDays(parseDate(monday), -14)), lastMonday, monday],
    monday === thisMonday ? monday : null,
    first?.date ?? monday,
    features,
    { week, tracks, sessions },
  )
  const ratings = workRatings(weekEntries.filter((entry) => entry.key === 'work').map((entry) => entry.value))
  const energy = weekEntries.filter((entry) => entry.key === 'energy').map((entry) => Number(entry.value)).filter((value) => value >= 1 && value <= 3)
  const daysSoFar = until < monday ? 0 : daysBetween(parseDate(monday), parseDate(until)) + 1
  const tickedDays = (id: string) => new Set(weekEntries.filter((entry) => entry.key === `tick:${id}` && entry.value === true).map((entry) => entry.date)).size
  const weights = alive(measurements)
    .filter((row) => row.kind === 'weight')
    .sort((a, b) => a.date.localeCompare(b.date))
  const weighIns = weights.filter((row) => inWeek(row.date)).map((row) => ({ date: row.date, value: row.value }))
  const before = weights.filter((row) => row.date < monday).at(-1)
  const weightChange = weighIns.length && before ? Math.round((weighIns[weighIns.length - 1].value - before.value) * 10) / 10 : null
  const finished = alive(media).filter((item) => item.status === 'done' && inWeek(item.finished))
  const tasksDone = alive(finishedTasks).filter((task) => task.done).length
  const routinesDone = alive(routineLogs).length
  const trackWeeks = tracks
    .map((track) => {
      const done = sessions.filter((session) => session.trackId === track.id && inWeek(session.date))
      return {
        id: track.id,
        name: track.name,
        days: new Set(done.map((session) => session.date)).size,
        minutes: Math.round(hoursOf(done) * 60),
        steps: stepsOf(track.id, alive(topics)).filter((step) => inWeek(step.doneDate)).length,
      }
    })
    .filter((track) => track.days)

  // What went well, filled in from the week: habits on target first, then what got done.
  const wentWell: string[] = []
  for (const row of habitWeeks) {
    const current = row.weeks[row.weeks.length - 1]
    if (current.target && current.count >= current.target) wentWell.push(`${row.label}: ${countText(current.count)} of ${current.target}`)
  }
  for (const track of trackWeeks) {
    const extra = [track.steps ? plural(track.steps, 'step') : '', track.minutes ? `${track.minutes} min` : ''].filter(Boolean).join(', ')
    wentWell.push(`${track.name}: ${plural(track.days, 'day')}${extra ? ` (${extra})` : ''}`)
  }
  if (routinesDone) wentWell.push(`${plural(routinesDone, 'routine')} done`)
  if (tasksDone) wentWell.push(`${plural(tasksDone, 'task')} done`)
  for (const item of finished) wentWell.push(`Finished ${item.title}`)
  if (weightChange !== null && weightChange < 0) wentWell.push(`Weight down ${Math.abs(weightChange).toFixed(1)} kg`)

  return {
    features,
    monday,
    sunday,
    habits: habitWeeks,
    crunchDays: countCrunchDays(crunches, monday, sunday),
    tracks: trackWeeks,
    routinesDone,
    tasksDone,
    workAverage: average(ratings),
    energyAverage: average(energy),
    meds: { done: doses.reduce((sum, dose) => sum + tickedDays(dose.id), 0), of: doses.length * daysSoFar },
    workouts: {
      done: tickedDays('workout'),
      planned: features.exercise
        ? Array.from({ length: 7 }, (_, i) => week[weekdayIndex(addDays(parseDate(monday), i))]).filter((day) => day && day.workout !== 'rest').length
        : 0,
    },
    weighIns,
    weightChange,
    periodDays: tracking.periods ? weekEntries.filter((entry) => entry.key === 'period' && entry.value === true).length : null,
    finished,
    wentWell,
    notes: Object.fromEntries(REVIEW_NOTES.map((note) => [note.key, text(monday, note.key)])) as Record<ReviewNoteKey, string>,
    oldNotes: text(monday, 'review'),
    lastWeekNext: text(lastMonday, 'review:next'),
    reviewed: valueOf(monday, 'reviewed') === true,
  }
}
