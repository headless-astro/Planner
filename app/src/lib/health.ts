// The health summary on the Me tab (F35): weight and waist, and this week's workouts, meds
// and food rules so far.
import { addDays, parseDate, toISODate, weekStart, weekdayIndex } from './dates'
import type { Entry, Measurement } from './db'
import { getEntriesBetween, getMeasurements, getWeek, listDoses } from './repo'
import type { DayTemplate } from './setup'
import { eatingScore } from './week'

export interface MeasureSummary {
  latest: { date: string; value: number }
  /** Change since the first measurement; null with only one. */
  change: number | null
  since: string
  /** Change since the one before it, for the ↑/↓ on Me (F58); null with only one. */
  step: number | null
  previous: string | null
}

export interface Tally {
  done: number
  of: number
}

export interface HealthSummary {
  weight: MeasureSummary | null
  waist: MeasureSummary | null
  /** This week's average energy, 1–3 (F55); null before any is rated. */
  energy: number | null
  /** Workouts done this week, out of the week's workout days. */
  workouts: Tally
  /** Doses ticked this week, out of the doses due from Monday to today. */
  meds: Tally
  /** Days the food rules were kept this week, out of the rule days from Monday to today. */
  foodRules: Tally
}

export function measureSummary(rows: readonly Pick<Measurement, 'date' | 'value'>[], today: string): MeasureSummary | null {
  const past = rows.filter((row) => row.date <= today)
  if (!past.length) return null
  const first = past[0]
  const latest = past[past.length - 1]
  const before = past.length > 1 ? past[past.length - 2] : null
  return {
    latest: { date: latest.date, value: latest.value },
    change: past.length > 1 ? latest.value - first.value : null,
    since: first.date,
    step: before ? Math.round((latest.value - before.value) * 10) / 10 : null,
    previous: before?.date ?? null,
  }
}

/** Counts this week (Monday to today) from the saved day values. */
export function weekTallies(entries: readonly Entry[], week: readonly DayTemplate[], doseIds: readonly string[], today: string) {
  const monday = toISODate(weekStart(parseDate(today)))
  const soFar = Array.from({ length: weekdayIndex(parseDate(today)) + 1 }, (_, i) => toISODate(addDays(parseDate(monday), i)))
  const inWeek = entries.filter((entry) => entry.date >= monday && entry.date <= today)
  const daysWhere = (test: (entry: Entry) => boolean) => new Set(inWeek.filter(test).map((entry) => entry.date)).size
  const ticked = (id: string) => (entry: Entry) => entry.key === `tick:${id}` && entry.value === true
  const ruleDays = soFar.filter((date) => week[weekdayIndex(parseDate(date))]?.foodRules)

  return {
    workouts: { done: daysWhere(ticked('workout')), of: week.filter((day) => day.workout !== 'rest').length },
    meds: { done: doseIds.reduce((sum, id) => sum + daysWhere(ticked(id)), 0), of: doseIds.length * soFar.length },
    foodRules: {
      // Mostly counts as a day, Partly as half (D74).
      done: inWeek.filter((entry) => entry.key === 'rules' && ruleDays.includes(entry.date)).reduce((sum, entry) => sum + eatingScore(entry.value), 0),
      of: ruleDays.length,
    },
  }
}

export async function getHealthSummary(today: string): Promise<HealthSummary> {
  const monday = toISODate(weekStart(parseDate(today)))
  const [weights, waists, entries, week, doses] = await Promise.all([
    getMeasurements('weight'),
    getMeasurements('waist'),
    getEntriesBetween(monday, today),
    getWeek(),
    listDoses(),
  ])
  const energy = entries.filter((entry) => entry.key === 'energy').map((entry) => Number(entry.value)).filter((value) => value >= 1 && value <= 3)
  return {
    weight: measureSummary(weights, today),
    waist: measureSummary(waists, today),
    energy: energy.length ? Math.round((energy.reduce((sum, value) => sum + value, 0) / energy.length) * 10) / 10 : null,
    ...weekTallies(
      entries,
      week,
      doses.map((dose) => dose.id),
      today,
    ),
  }
}
