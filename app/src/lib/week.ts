// Weekly counts for "This week": on how many days of the week each thing was done.
import type { Entry, Habit } from './db'
import type { Targets } from './setup'

export interface Counter {
  id: string
  label: string
  count: number
  target: number | null
}

/** Ticks that also count for a habit: "log once, count everywhere" (F5). */
const ALSO_COUNTS: Record<string, string[]> = {
  drawing: ['drawing-study'],
}

/**
 * @param crunchDays crunch days in the week. They're left out of the targets (D20): with 2
 * crunch days, a target of 6 a week becomes ceil(6 × 5/7) = 5.
 */
export function weekCounters(entries: Entry[], habits: Habit[], targets: Targets, crunchDays = 0): Counter[] {
  const daysWhere = (test: (entry: Entry) => boolean) => new Set(entries.filter(test).map((entry) => entry.date)).size
  const ticked =
    (...ids: string[]) =>
    (entry: Entry) =>
      entry.value === true && ids.some((id) => entry.key === `tick:${id}`)
  const share = Math.max(0, 7 - crunchDays) / 7
  const target = (value: number | null) => (value === null ? null : Math.ceil(value * share))

  return [
    { id: 'rules', label: 'Food rules', count: daysWhere((entry) => entry.key === 'rules' && entry.value === 'kept'), target: target(targets.rules) },
    { id: 'fitness', label: 'Fitness', count: daysWhere(ticked('workout')), target: target(targets.fitness) },
    { id: 'spanish', label: 'Spanish', count: daysWhere(ticked('spanish', 'spanish-book')), target: target(targets.spanish) },
    { id: 'study', label: 'Study', count: daysWhere(ticked('study')), target: target(targets.study) },
    { id: 'skin', label: 'Skin', count: daysWhere(ticked('skin')), target: target(targets.skin) },
    ...habits.map((habit) => ({
      id: habit.id,
      label: habit.label,
      count: daysWhere(ticked(habit.id, ...(ALSO_COUNTS[habit.id] ?? []))),
      target: target(habit.weeklyTarget),
    })),
  ]
}
