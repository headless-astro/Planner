// Your data, week by week, for an AI to analyse (F73). buildAnalysis() is a plain function over
// what's logged; getAnalysis() loads it. analysisText.ts writes it out as Markdown.
import { scheduledThings } from './activities'
import type { AnalysisDay, AnalysisNote, AnalysisWeek } from './analysisText'
import { countCrunchDays, isCrunchDay, listCrunches } from './crunch'
import { addDays, daysBetween, parseDate, toISODate, weekStart, weekdayIndex } from './dates'
import { db, type Crunch, type Dose, type Entry, type Habit, type Measurement, type RoutineLog, type Task, type Topic, type Track, type TrackSession } from './db'
import { ALL_FEATURES, type Features } from './features'
import { habitRows } from './insights'
import { getFeatures, getFoodRules, getTargets, getTracking, getWeek, listDoses, listHabits } from './repo'
import type { DayTemplate, Targets } from './setup'
import { alive } from './store'
import { hoursOf, listTracks, stepsOf } from './tracks'
import { workRatings } from './week'

export interface AnalysisData {
  entries: Entry[]
  habits: Habit[]
  targets: Targets
  crunches: Crunch[]
  week: DayTemplate[]
  tracks: Track[]
  trackSessions: TrackSession[]
  topics: Topic[]
  routineLogs: RoutineLog[]
  tasks: Task[]
  measurements: Measurement[]
  doses: Dose[]
  features?: Features
  periodsOn: boolean
}

/** How far back an export goes: finished weeks before this one, or every week since the first log. */
export type AnalysisSpan = 4 | 13 | 'all'

export const SPANS: { id: AnalysisSpan; label: string }[] = [
  { id: 4, label: 'Last 4 weeks' },
  { id: 13, label: '3 months' },
  { id: 'all', label: 'Everything' },
]

const EATING: Record<string, AnalysisDay['eating']> = { kept: 'mostly', partly: 'partly', slip: 'not really' }
const round1 = (value: number) => Math.round(value * 10) / 10
const average = (values: number[]) => (values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null)
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

/** Every week from the first one with anything logged to this one, oldest first. */
export function buildAnalysis(data: AnalysisData, today: string, span: AnalysisSpan = 'all'): AnalysisWeek[] {
  const features = data.features ?? ALL_FEATURES
  const entries = alive(data.entries).filter((entry) => entry.date <= today)
  const sessions = alive(data.trackSessions).filter((session) => session.date <= today)
  const measurements = alive(data.measurements).filter((row) => row.date <= today)
  const routineLogs = alive(data.routineLogs)
  const tasks = alive(data.tasks)

  const since = [
    ...entries.filter((entry) => !entry.key.startsWith('review')).map((entry) => entry.date),
    ...measurements.map((row) => row.date),
    ...sessions.map((row) => row.date),
    ...routineLogs.map((row) => row.date),
    ...tasks.flatMap((task) => (task.done && task.doneDate ? [task.doneDate] : [])),
  ]
    .filter((date) => date <= today)
    .sort()[0]
  if (!since) return []

  const thisMonday = toISODate(weekStart(parseDate(today)))
  const firstMonday = toISODate(weekStart(parseDate(since)))
  const allWeeks = Math.round(daysBetween(parseDate(firstMonday), parseDate(thisMonday)) / 7)
  const finished = span === 'all' ? allWeeks : Math.min(span, allWeeks)
  const mondays = Array.from({ length: finished + 1 }, (_, i) => toISODate(addDays(parseDate(thisMonday), -7 * (finished - i))))

  const habitWeeks = habitRows(entries, data.habits, data.targets, data.crunches, mondays, thisMonday, since, features, {
    week: data.week,
    tracks: data.tracks,
    sessions,
  })

  // What a note is on: a habit, the workout, a track, or an activity in your own words.
  const things = scheduledThings(data.week, data.tracks)
  const doseIds = new Set(data.doses.map((dose) => dose.id))
  const noteLabel = (id: string) =>
    id === 'workout'
      ? 'Workout'
      : (data.habits.find((habit) => habit.id === id)?.label ??
        data.tracks.find((track) => track.id === id)?.name ??
        things.find((thing) => thing.key === id)?.label ??
        id.replace(/^act:/, '').replace(/-/g, ' '))
  const trackName = (id: string) => data.tracks.find((track) => track.id === id)?.name ?? 'A track'
  const topics = alive(data.topics)

  return mondays.map((monday, index) => {
    const sunday = toISODate(addDays(parseDate(monday), 6))
    const until = sunday < today ? sunday : today
    const inWeek = (date: string | null | undefined) => !!date && date >= monday && date <= until
    const weekEntries = entries.filter((entry) => inWeek(entry.date))
    const of = (key: string) => weekEntries.filter((entry) => entry.key === key)
    const days = Array.from({ length: daysBetween(parseDate(monday), parseDate(until)) + 1 }, (_, i) => toISODate(addDays(parseDate(monday), i)))
    const tickedDays = (id: string) => new Set(weekEntries.filter((entry) => entry.key === `tick:${id}` && entry.value === true).map((entry) => entry.date)).size

    const weekSessions = sessions.filter((session) => inWeek(session.date))
    const weighIns = (kind: Measurement['kind']) =>
      measurements
        .filter((row) => row.kind === kind && inWeek(row.date))
        .sort((a, b) => a.date.localeCompare(b.date))
        .at(-1)?.value

    const eating = of('rules').map((entry) => entry.value)
    const energy = of('energy').map((entry) => Number(entry.value)).filter((value) => value >= 1 && value <= 3)
    const work = of('work').map((entry) => entry.value)
    const ratings = workRatings(work)

    const week: AnalysisWeek = {
      monday,
      inProgress: monday === thisMonday,
      crunchDays: countCrunchDays(data.crunches, monday, until),
      habits: habitWeeks.flatMap((row) => {
        const cell = row.weeks[index]
        return cell && (cell.target || cell.count) ? [{ label: row.label, count: cell.count, target: cell.target }] : []
      }),
      tracks: data.tracks
        .map((track) => {
          const done = weekSessions.filter((session) => session.trackId === track.id)
          return {
            name: track.name,
            days: new Set(done.map((session) => session.date)).size,
            minutes: Math.round(hoursOf(done) * 60),
            steps: stepsOf(track.id, topics).filter((step) => inWeek(step.doneDate)).length,
          }
        })
        .filter((track) => track.days || track.steps),
      routinesDone: routineLogs.filter((log) => inWeek(log.date)).length,
      tasksDone: tasks.filter((task) => task.done && inWeek(task.doneDate)).length,
      review: {
        well: text(entries.find((entry) => entry.date === monday && entry.key === 'review:well')?.value),
        hard: text(entries.find((entry) => entry.date === monday && entry.key === 'review:hard')?.value),
        next: text(entries.find((entry) => entry.date === monday && entry.key === 'review:next')?.value),
        earlier: text(entries.find((entry) => entry.date === monday && entry.key === 'review')?.value),
      },
      days: [],
    }
    if (features.exercise) {
      week.workouts = { done: tickedDays('workout'), planned: days.filter((date) => (data.week[weekdayIndex(parseDate(date))]?.workout ?? 'rest') !== 'rest').length }
    }
    if (features.food) {
      week.eating = {
        mostly: eating.filter((value) => value === 'kept').length,
        partly: eating.filter((value) => value === 'partly').length,
        notReally: eating.filter((value) => value === 'slip').length,
      }
    }
    if (features.energy) week.energy = { average: average(energy), days: energy.length }
    if (features.work) week.work = { average: average(ratings), days: ratings.length, nothing: work.filter((value) => value === '–').length }
    if (data.doses.length) week.meds = { done: data.doses.reduce((sum, dose) => sum + tickedDays(dose.id), 0), of: data.doses.length * days.length }
    if (features.body) {
      week.weight = weighIns('weight')
      week.waist = weighIns('waist')
    }
    if (data.periodsOn) week.periodDays = of('period').filter((entry) => entry.value === true).length

    for (const date of days) {
      const dayEntries = weekEntries.filter((entry) => entry.date === date)
      const value = (key: string) => dayEntries.find((entry) => entry.key === key)?.value
      const notes: AnalysisNote[] = [
        ...dayEntries
          .filter((entry) => entry.key.startsWith('note:') && !doseIds.has(entry.key.slice(5)) && text(entry.value))
          .map((entry) => ({ what: noteLabel(entry.key.slice(5)), text: text(entry.value) ?? '' })),
        ...weekSessions
          .filter((session) => session.date === date && (text(session.practiced) || text(session.feeling)))
          .map((session) => ({ what: trackName(session.trackId), text: [text(session.practiced), text(session.feeling)].filter(Boolean).join(' — ') })),
      ]
      const day: AnalysisDay = { date }
      const eatingValue = EATING[String(value('rules'))]
      if (features.food && eatingValue) day.eating = eatingValue
      if (features.diary && text(value('diary'))) day.diary = text(value('diary'))
      if (text(value('note'))) day.note = text(value('note'))
      if (notes.length) day.notes = notes
      const energyValue = Number(value('energy'))
      if (features.energy && energyValue >= 1 && energyValue <= 3) day.energy = energyValue
      const workValue = value('work')
      if (features.work && (workValue === '–' || workRatings([workValue]).length)) day.work = String(workValue)
      if (data.periodsOn && value('period') === true) day.period = true
      if (isCrunchDay(data.crunches, date)) day.crunch = true
      const weight = measurements.find((row) => row.kind === 'weight' && row.date === date)?.value
      const waist = measurements.find((row) => row.kind === 'waist' && row.date === date)?.value
      if (features.body && weight !== undefined) day.weight = weight
      if (features.body && waist !== undefined) day.waist = waist
      if (Object.keys(day).length > 1) week.days.push(day)
    }
    return week
  })
}

export async function getAnalysis(today: string, span: AnalysisSpan = 'all'): Promise<{ weeks: AnalysisWeek[]; guidelines: string[] }> {
  const [entries, habits, targets, crunches, week, tracks, trackSessions, topics, routineLogs, tasks, measurements, doses, features, tracking, guidelines] = await Promise.all([
    db.entries.toArray(),
    listHabits(),
    getTargets(),
    listCrunches(),
    getWeek(),
    listTracks(),
    db.trackSessions.toArray(),
    db.topics.toArray(),
    db.routineLogs.toArray(),
    db.tasks.toArray(),
    db.measurements.toArray(),
    listDoses(),
    getFeatures(),
    getTracking(),
    getFoodRules(),
  ])
  const weeks = buildAnalysis(
    { entries, habits, targets, crunches, week, tracks, trackSessions, topics, routineLogs, tasks, measurements, doses, features, periodsOn: tracking.periods },
    today,
    span,
  )
  return { weeks, guidelines: features.food ? guidelines : [] }
}
