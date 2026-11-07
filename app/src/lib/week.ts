// Weekly counts for "This week": on how many days of the week each thing was done.
import { scheduledThings } from './activities'
import { addDays, parseDate, toISODate } from './dates'
import type { Entry, Habit, Track, TrackSession } from './db'
import { ALL_FEATURES, type Features } from './features'
import type { DayTemplate } from './setup'
import { isRunning } from './tracks'
import type { Targets } from './setup'

export interface Counter {
  id: string
  label: string
  count: number
  target: number | null
}

/**
 * The food guidelines' daily check (D74): "How did eating go?". The stored values stay
 * "kept" and "slip" from the old Kept / Slip, with "partly" in between.
 */
export const EATING_CHOICES = [
  { value: 'kept', label: 'Mostly' },
  { value: 'partly', label: 'Partly' },
  { value: 'slip', label: 'Not really' },
] as const

/** Mostly counts as a day, Partly as half a day. */
export const eatingScore = (value: unknown) => (value === 'kept' ? 1 : value === 'partly' ? 0.5 : 0)

/** "Eating: mostly", for lists of days. */
export function eatingText(value: unknown): string {
  const choice = EATING_CHOICES.find((candidate) => candidate.value === value)
  return choice ? `Eating: ${choice.label.toLowerCase()}` : ''
}

/** 3, or 2½ when a Partly day is in it. */
export function countText(count: number): string {
  const whole = Math.floor(count)
  return count - whole >= 0.5 ? `${whole || ''}½` : String(whole)
}

/** Work ratings 1–3 as numbers; "–" (nothing done) isn't a rating. */
export const workRatings = (values: unknown[]) => values.map(Number).filter((value) => value >= 1 && value <= 3)

/** The week's activities, for counting tracks and your own activities (F69, F70, D86). */
export interface WeekPlan {
  monday: string
  week: readonly DayTemplate[]
  tracks: readonly Track[]
  /** Sessions in this week. */
  sessions: readonly TrackSession[]
}

/** Ticks that also count for a habit: "log once, count everywhere" (F5). */
const ALSO_COUNTS: Record<string, string[]> = {
  drawing: ['drawing-study'],
}

/**
 * @param crunchDays crunch days in the week. They're left out of the targets (D20): with 2
 * crunch days, a target of 6 a week becomes ceil(6 × 5/7) = 5.
 */
export function weekCounters(
  entries: Entry[],
  habits: Habit[],
  targets: Targets,
  crunchDays = 0,
  features: Features = ALL_FEATURES,
  plan?: WeekPlan,
): Counter[] {
  const daysWhere = (test: (entry: Entry) => boolean) => new Set(entries.filter(test).map((entry) => entry.date)).size
  const ticked =
    (...ids: string[]) =>
    (entry: Entry) =>
      entry.value === true && ids.some((id) => entry.key === `tick:${id}`)
  const share = Math.max(0, 7 - crunchDays) / 7
  const target = (value: number | null) => (value === null ? null : Math.ceil(value * share))

  // The built-in counts go with their part of the app (F63).
  const builtIn: (Counter & { on: boolean })[] = [
    {
      on: features.food,
      id: 'rules',
      label: 'Food guidelines',
      count: entries.filter((entry) => entry.key === 'rules').reduce((sum, entry) => sum + eatingScore(entry.value), 0),
      target: target(targets.rules),
    },
    { on: features.exercise, id: 'fitness', label: 'Fitness', count: daysWhere(ticked('workout')), target: target(targets.fitness) },
  ]
  // Tracks and your own activities on the week: by default the target is the days they're on.
  const planned: Counter[] = []
  if (plan) {
    const sunday = toISODate(addDays(parseDate(plan.monday), 6))
    for (const thing of scheduledThings(plan.week, plan.tracks)) {
      if (thing.trackId) {
        const track = plan.tracks.find((candidate) => candidate.id === thing.trackId)
        const sessions = plan.sessions.filter((session) => session.trackId === thing.trackId)
        if (!track || (!isRunning(track, sunday) && !isRunning(track, plan.monday) && !sessions.length)) continue
        planned.push({
          id: thing.key,
          label: thing.label,
          count: new Set(sessions.map((session) => session.date)).size,
          target: target(track.target ?? thing.weekdays.length),
        })
      } else {
        planned.push({ id: thing.key, label: thing.label, count: daysWhere(ticked(thing.key)), target: target(thing.weekdays.length) })
      }
    }
  }
  return [
    ...builtIn.filter((counter) => counter.on).map(({ on: _on, ...counter }) => counter),
    ...planned,
    ...habits.map((habit) => ({
      id: habit.id,
      label: habit.label,
      count: daysWhere(ticked(habit.id, ...(ALSO_COUNTS[habit.id] ?? []))),
      target: target(habit.weeklyTarget),
    })),
  ]
}
