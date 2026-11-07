// Insights (F53): History and Stats in one place. Plain functions over everything logged, so
// they're easy to test; getInsights() loads the data and hands it to buildInsights().
import { countCrunchDays, isCrunchDay, listCrunches } from './crunch'
import { addDays, daysBetween, formatShort, parseDate, toISODate, weekStart, weekdayIndex } from './dates'
import { db, type Crunch, type Dose, type DrawingLog, type Entry, type Habit, type Measurement, type MediaItem, type RoutineLog, type SpanishLog, type Task, type Topic, type Track, type TrackSession } from './db'
import { SHELVES, shelfOf, thumbOf, type Shelf } from './media'
import { getFeatures, getTargets, getTracking, getWeek, listDoses, listHabits } from './repo'
import { getRoutineStatuses, type RoutineStatus } from './routines'
import type { DayTemplate, Targets } from './setup'
import { alive } from './store'
import { hoursOf, listTracks, milestoneProgress, stepsOf } from './tracks'
import { weekCounters, workRatings } from './week'
import { ALL_FEATURES, type Features } from './features'

export type Period = 'week' | 'month' | 'quarter' | 'all'

export const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: '3 months' },
  { id: 'all', label: 'All' },
]

/** Finished weeks before this one that each period covers ("All" goes back to the first log). */
const PERIOD_WEEKS: Record<Exclude<Period, 'all'>, number> = { week: 4, month: 4, quarter: 13 }
/** At most this many bars in a habit's strip. */
const MAX_STRIP = 26

// ── Habits as % of their target (D66) ──

export interface HabitWeek {
  monday: string
  count: number
  target: number | null
  /** count / target, which can go over 100; null without a target. */
  percent: number | null
  inProgress: boolean
}

export interface HabitRow {
  id: string
  label: string
  /** Oldest first; the last one is the current (or reviewed) week. */
  weeks: HabitWeek[]
  /** Average % over the finished weeks; null without a target or finished weeks. */
  average: number | null
  /** Finished weeks in a row on target, up to the last one. */
  streak: number
  /** Finished weeks in a row under target, up to the last one (D67). */
  under: number
}

const percentOf = (count: number, target: number | null) => (target ? Math.round((count / target) * 100) : null)

/**
 * Each habit's weeks, from the Mondays given (oldest first). `current` is the week still going.
 * Weeks that ended before `since` (the first day anything was logged) are blank, so a new
 * start doesn't read as weeks under target.
 */
export function habitRows(
  entries: readonly Entry[],
  habits: readonly Habit[],
  targets: Targets,
  crunches: readonly Crunch[],
  mondays: readonly string[],
  thisWeek: string | null,
  since: string | null = null,
  features: Features = ALL_FEATURES,
  plan?: { week: readonly DayTemplate[]; tracks: readonly Track[]; sessions: readonly TrackSession[] },
): HabitRow[] {
  const perWeek = mondays.map((monday) => {
    const sunday = toISODate(addDays(parseDate(monday), 6))
    const inWeek = entries.filter((entry) => entry.date >= monday && entry.date <= sunday)
    const weekPlan = plan
      ? { monday, week: plan.week, tracks: plan.tracks, sessions: plan.sessions.filter((session) => session.date >= monday && session.date <= sunday) }
      : undefined
    return { monday, counters: weekCounters(inWeek, [...habits], targets, countCrunchDays(crunches, monday, sunday), features, weekPlan) }
  })
  // Line the weeks up by id: a track that started or ended isn't in every week.
  const all = new Map<string, string>()
  for (const { counters } of [...perWeek].reverse()) for (const counter of counters) if (!all.has(counter.id)) all.set(counter.id, counter.label)
  const current = perWeek[perWeek.length - 1]?.counters ?? []
  const order = [...current.map((counter) => counter.id), ...[...all.keys()].filter((id) => !current.some((counter) => counter.id === id))]
  return order.map((id) => {
    const counter = { id, label: all.get(id) ?? id }
    const weeks: HabitWeek[] = perWeek.map(({ monday, counters }) => {
      const cell = counters.find((candidate) => candidate.id === id) ?? { count: 0, target: null }
      const before = since === null || toISODate(addDays(parseDate(monday), 6)) < since
      return { monday, count: cell.count, target: cell.target, percent: before ? null : percentOf(cell.count, cell.target), inProgress: monday === thisWeek }
    })
    const finished = weeks.filter((week) => !week.inProgress && week.percent !== null)
    const run = (test: (percent: number) => boolean) => {
      let n = 0
      for (let i = finished.length - 1; i >= 0 && test(finished[i].percent ?? 0); i--) n++
      return n
    }
    return {
      id: counter.id,
      label: counter.label,
      weeks,
      average: finished.length ? Math.round(finished.reduce((sum, week) => sum + (week.percent ?? 0), 0) / finished.length) : null,
      streak: run((percent) => percent >= 100),
      under: run((percent) => percent < 100),
    }
  })
}

// ── Everything on the page ──

export interface InsightsData {
  entries: Entry[]
  habits: Habit[]
  targets: Targets
  crunches: Crunch[]
  routines: RoutineStatus[]
  routineLogs: RoutineLog[]
  tasks: Task[]
  measurements: Measurement[]
  doses: Dose[]
  week: DayTemplate[]
  media: MediaItem[]
  tracks: Track[]
  topics: Topic[]
  /** Kept for the days they were logged on, from before Spanish and drawing were tracks. */
  spanishLogs: SpanishLog[]
  drawingLogs: DrawingLog[]
  trackSessions: TrackSession[]
  /** Other dates something was saved on (snacks, cooking, crafts), for the logged days. */
  otherDates: string[]
  periodsOn: boolean
  /** What's turned on (F63); everything by default. */
  features?: Features
}

export interface Slip {
  text: string
  href: string
}

export interface Insights {
  period: Period
  features: Features
  /** The weight goal's pace in kg a week, for the chart; null for none. */
  weeklyLoss: number | null
  /** The first day the numbers cover. */
  from: string
  habits: HabitRow[]
  wins: string[]
  slipping: Slip[]
  health: {
    weights: Measurement[]
    waists: Measurement[]
    /** "−0.3 kg a week since 12 Oct", or null without two in the period. */
    weightTrend: string | null
    waistTrend: string | null
    workouts: { done: number; planned: number }
    meds: { done: number; of: number }
    eating: { mostly: number; partly: number; notReally: number }
    energy: { average: number | null; days: number; low: number; mid: number; high: number }
    /** Energy on period days and the rest, once there are 3 of each. */
    energyByPeriod: { period: number; other: number } | null
    /** Null when period tracking is off. */
    periodDays: number | null
  }
  work: { average: number | null; days: number; nothing: number }
  /** Each track in the period (F69): sessions, steps and hours. */
  tracks: { id: string; name: string; sessions: number; stepsDone: number; stepsTotal: number; stepsInPeriod: number; hours: number | null; hoursInPeriod: number; milestone: string | null }[]
  routines: { done: number; tracked: number; onTime: number }
  tasks: { done: number; perWeek: number; late: number }
  freeTime: { finished: Record<Shelf, number>; movieStars: number | null; liked: number; rated: number }
  overall: { since: string | null; logged: number; days: number }
  /** This week's review: marked done, or notes written. */
  review: { done: boolean; notes: boolean }
  /** For the calendar. */
  loggedDates: string[]
  periodDates: string[]
}

const round1 = (value: number) => Math.round(value * 10) / 10
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(1)}`

/** Change per week between the first and last measurement in the list. */
function trend(rows: readonly Measurement[], unit: string): string | null {
  if (rows.length < 2) return null
  const first = rows[0]
  const last = rows[rows.length - 1]
  const days = daysBetween(parseDate(first.date), parseDate(last.date))
  if (days < 1) return null
  return `${signed(((last.value - first.value) / days) * 7)} ${unit} a week since ${formatShort(parseDate(first.date))}`
}

/** "2 books and 1 movie" */
function listing(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export function buildInsights(data: InsightsData, today: string, period: Period): Insights {
  const thisMonday = toISODate(weekStart(parseDate(today)))
  const live = alive(data.entries)

  // The days with anything saved (D6). Review notes don't count as logging a day.
  const loggedSet = new Set(
    [
      ...live.filter((entry) => !entry.key.startsWith('review')).map((entry) => entry.date),
      ...data.measurements.map((row) => row.date),
      ...data.routineLogs.map((row) => row.date),
      ...data.trackSessions.map((row) => row.date),
      ...data.spanishLogs.map((row) => row.date),
      ...data.drawingLogs.map((row) => row.date),
      ...data.otherDates,
      ...data.tasks.flatMap((task) => (task.done && task.doneDate ? [task.doneDate] : [])),
    ].filter((date) => date <= today),
  )
  const since = [...loggedSet].sort()[0] ?? null

  // The weeks: some finished ones, then this one.
  const finishedWeeks =
    period === 'all'
      ? since
        ? Math.max(0, Math.round(daysBetween(weekStart(parseDate(since)), parseDate(thisMonday)) / 7))
        : 0
      : PERIOD_WEEKS[period]
  const mondays = Array.from({ length: finishedWeeks + 1 }, (_, i) => toISODate(addDays(parseDate(thisMonday), -7 * (finishedWeeks - i))))
  const from = period === 'week' ? thisMonday : mondays[0]
  const inRange = (date: string | null | undefined) => !!date && date >= from && date <= today
  const rangeDays = daysBetween(parseDate(from), parseDate(today)) + 1

  // Averages and runs use every week in the period; the strip shows the latest MAX_STRIP.
  const features = data.features ?? ALL_FEATURES
  const habits = habitRows(live, data.habits, data.targets, data.crunches, mondays, thisMonday, since, features, {
    week: data.week,
    tracks: data.tracks,
    sessions: data.trackSessions,
  }).map((row) => ({
    ...row,
    weeks: row.weeks.slice(-MAX_STRIP),
  }))
  const entriesIn = live.filter((entry) => inRange(entry.date))
  const valuesOf = (key: string) => entriesIn.filter((entry) => entry.key === key)

  // ── Wins first ──
  const wins: string[] = []
  for (const row of [...habits].filter((habit) => habit.streak >= 2).sort((a, b) => b.streak - a.streak).slice(0, 2)) {
    wins.push(`${row.label} on target ${row.streak} weeks running`)
  }
  const targeted = habits.filter((row) => row.weeks[row.weeks.length - 1]?.target)
  if (period === 'week') {
    const reached = targeted.filter((row) => {
      const week = row.weeks[row.weeks.length - 1]
      return week.target !== null && week.count >= week.target
    }).length
    if (reached) wins.push(`${reached} of ${targeted.length} habits already on target this week`)
  } else {
    const onAverage = targeted.filter((row) => (row.average ?? 0) >= 100).length
    if (onAverage) wins.push(`${onAverage} of ${targeted.length} habits on target on average`)
    const finished = mondays.slice(0, -1)
    if (finished.length >= 2) {
      const scores = finished.map((monday) => {
        const cells = habits.map((row) => row.weeks.find((week) => week.monday === monday)?.percent).filter((value): value is number => value != null)
        return { monday, score: cells.length ? cells.reduce((sum, value) => sum + value, 0) / cells.length : 0 }
      })
      const best = scores.reduce((a, b) => (b.score > a.score ? b : a))
      if (best.score > 0) wins.push(`Best week: from ${formatShort(parseDate(best.monday))}, ${Math.round(best.score)}% of your targets`)
    }
  }
  const finishedMedia = data.media.filter((item) => item.status === 'done' && inRange(item.finished))
  const byShelf = Object.fromEntries((Object.keys(SHELVES) as Shelf[]).map((shelf) => [shelf, finishedMedia.filter((item) => shelfOf(item) === shelf).length])) as Record<Shelf, number>
  const finishedParts = (Object.keys(SHELVES) as Shelf[]).filter((shelf) => byShelf[shelf]).map((shelf) => plural(byShelf[shelf], SHELVES[shelf].one))
  if (finishedParts.length) wins.push(`Finished ${listing(finishedParts)}`)
  const routinesDone = data.routineLogs.filter((log) => inRange(log.date)).length
  if (routinesDone) wins.push(`${plural(routinesDone, 'routine')} done`)

  // ── What's slipping: only what's held on for a while (D67) ──
  const slipping: Slip[] = []
  for (const row of habits.filter((habit) => habit.under >= 2)) {
    slipping.push({ text: `${row.label}: under target ${row.under} weeks running`, href: '#/week' })
  }
  const listed = new Set<string>()
  for (const status of data.routines) {
    const interval = status.routine.intervalDays
    if (status.dueIn !== null && !status.doneThatDay && -status.dueIn > interval / 2) {
      slipping.push({ text: `${status.routine.name}: ${plural(-status.dueIn, 'day')} late`, href: '#/routines' })
      listed.add(status.routine.id)
    }
  }
  for (const status of data.routines) {
    const gap = status.averageGap
    const interval = status.routine.intervalDays
    if (listed.has(status.routine.id) || gap === null || status.count < 3 || gap - interval <= interval / 2) continue
    slipping.push({ text: `${status.routine.name}: usually about ${plural(Math.round(gap - interval), 'day')} late`, href: '#/routines' })
  }
  const lateTasks = data.tasks.filter((task) => !task.done && task.listId !== null && task.due !== null && task.due < today)
  if (lateTasks.length) {
    const names = lateTasks.slice(0, 2).map((task) => task.title).join(', ')
    slipping.push({ text: `${plural(lateTasks.length, 'task')} past the deadline: ${names}${lateTasks.length > 2 ? '…' : ''}`, href: '#/upcoming' })
  }

  // ── Health ──
  const weights = data.measurements.filter((row) => row.kind === 'weight').sort((a, b) => a.date.localeCompare(b.date))
  const waists = data.measurements.filter((row) => row.kind === 'waist').sort((a, b) => a.date.localeCompare(b.date))
  const days = Array.from({ length: rangeDays }, (_, i) => toISODate(addDays(parseDate(from), i)))
  const ticked = (id: string) => new Set(entriesIn.filter((entry) => entry.key === `tick:${id}` && entry.value === true).map((entry) => entry.date))
  const planned = days.filter((date) => {
    const day = data.week[weekdayIndex(parseDate(date))]
    return features.exercise && day && day.workout !== 'rest'
  }).length
  const medsDone = data.doses.reduce((sum, dose) => sum + ticked(dose.id).size, 0)
  const eating = valuesOf('rules')
  const energyValues = valuesOf('energy').map((entry) => Number(entry.value)).filter((value) => value >= 1 && value <= 3)
  const periodDates = data.periodsOn ? live.filter((entry) => entry.key === 'period' && entry.value === true).map((entry) => entry.date) : []
  const average = (values: number[]) => (values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null)
  let energyByPeriod: Insights['health']['energyByPeriod'] = null
  if (data.periodsOn) {
    const onPeriod = valuesOf('energy').filter((entry) => periodDates.includes(entry.date)).map((entry) => Number(entry.value))
    const other = valuesOf('energy').filter((entry) => !periodDates.includes(entry.date)).map((entry) => Number(entry.value))
    if (onPeriod.length >= 3 && other.length >= 3) energyByPeriod = { period: average(onPeriod) ?? 0, other: average(other) ?? 0 }
  }

  // ── Work ──
  const work = valuesOf('work')
  const ratings = workRatings(work.map((entry) => entry.value))

  // ── Free time ──
  const movies = finishedMedia.filter((item) => SHELVES[shelfOf(item)].stars && item.rating != null)
  const thumbs = finishedMedia.filter((item) => !SHELVES[shelfOf(item)].stars && thumbOf(item))

  // ── Routines and tasks ──
  const tracked = data.routines.filter((status) => status.averageGap !== null)
  const tasksDone = data.tasks.filter((task) => task.done && inRange(task.doneDate)).length

  // Days in the period, leaving out crunch days with nothing logged (D20).
  const countable = days.filter((date) => (!since || date >= since) && (loggedSet.has(date) || !isCrunchDay(data.crunches, date)))

  return {
    period,
    features,
    weeklyLoss: data.targets.weeklyLoss ?? null,
    from,
    habits,
    wins,
    slipping,
    health: {
      weights,
      waists,
      weightTrend: trend(weights.filter((row) => inRange(row.date)), 'kg'),
      waistTrend: trend(waists.filter((row) => inRange(row.date)), 'cm'),
      workouts: { done: ticked('workout').size, planned },
      meds: { done: medsDone, of: data.doses.length * rangeDays },
      eating: {
        mostly: eating.filter((entry) => entry.value === 'kept').length,
        partly: eating.filter((entry) => entry.value === 'partly').length,
        notReally: eating.filter((entry) => entry.value === 'slip').length,
      },
      energy: {
        average: average(energyValues),
        days: energyValues.length,
        low: energyValues.filter((value) => value === 1).length,
        mid: energyValues.filter((value) => value === 2).length,
        high: energyValues.filter((value) => value === 3).length,
      },
      energyByPeriod,
      periodDays: data.periodsOn ? periodDates.filter((date) => inRange(date)).length : null,
    },
    work: { average: average(ratings), days: ratings.length, nothing: work.filter((entry) => entry.value === '–').length },
    tracks: data.tracks.map((track) => {
      const sessions = data.trackSessions.filter((session) => session.trackId === track.id)
      const steps = stepsOf(track.id, data.topics)
      const hours = track.milestones ? round1(hoursOf(sessions)) : null
      return {
        id: track.id,
        name: track.name,
        sessions: new Set(sessions.filter((session) => inRange(session.date)).map((session) => session.date)).size,
        stepsDone: steps.filter((step) => step.doneDate).length,
        stepsTotal: track.steps ? steps.length : 0,
        stepsInPeriod: steps.filter((step) => inRange(step.doneDate)).length,
        hours,
        hoursInPeriod: round1(hoursOf(sessions.filter((session) => inRange(session.date)))),
        milestone: hours !== null && track.milestones?.length ? milestoneProgress(hours, track.milestones).reached : null,
      }
    }),
    routines: { done: routinesDone, tracked: tracked.length, onTime: tracked.filter((status) => (status.averageGap ?? 0) <= status.routine.intervalDays + 1).length },
    tasks: { done: tasksDone, perWeek: round1(tasksDone / Math.max(1, rangeDays / 7)), late: lateTasks.length },
    freeTime: {
      finished: byShelf,
      movieStars: average(movies.map((item) => item.rating ?? 0)),
      liked: thumbs.filter((item) => thumbOf(item) === 'up').length,
      rated: thumbs.length,
    },
    overall: { since, logged: countable.filter((date) => loggedSet.has(date)).length, days: countable.length },
    review: {
      done: live.some((entry) => entry.date === thisMonday && entry.key === 'reviewed' && entry.value === true),
      notes: live.some((entry) => entry.date === thisMonday && entry.key.startsWith('review') && typeof entry.value === 'string' && entry.value.trim() !== ''),
    },
    loggedDates: [...loggedSet].sort(),
    periodDates: periodDates.sort(),
  }
}

export async function getInsights(today: string, period: Period): Promise<Insights> {
  const [entries, habits, targets, crunches, routines, routineLogs, tasks, measurements, doses, week, media, topics, spanishLogs, drawingLogs, trackSessions, snacks, cooked, crafts, tracking, tracks] =
    await Promise.all([
      db.entries.toArray(),
      listHabits(),
      getTargets(),
      listCrunches(),
      getRoutineStatuses(today),
      db.routineLogs.toArray(),
      db.tasks.toArray(),
      db.measurements.toArray(),
      listDoses(),
      getWeek(),
      db.media.toArray(),
      db.topics.toArray(),
      db.spanishLogs.toArray(),
      db.drawingLogs.toArray(),
      db.trackSessions.toArray(),
      db.snacks.toArray(),
      db.cookedLogs.toArray(),
      db.craftLogs.toArray(),
      getTracking(),
      listTracks(),
    ])
  const features = await getFeatures()
  return buildInsights(
    {
      entries,
      habits,
      targets,
      crunches,
      routines,
      routineLogs: alive(routineLogs),
      tasks: alive(tasks),
      measurements: alive(measurements),
      doses,
      week,
      media: alive(media),
      tracks,
      topics: alive(topics),
      spanishLogs: alive(spanishLogs),
      drawingLogs: alive(drawingLogs),
      trackSessions: alive(trackSessions),
      otherDates: [...alive(snacks), ...alive(cooked), ...alive(crafts)].map((row) => row.date),
      periodsOn: tracking.periods,
      features,
    },
    today,
    period,
  )
}
