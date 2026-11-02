// Goals (PLAN.md 1.8, F17): the goal tree from the spreadsheet, with a progress line for each
// goal that's filled in from what you log.
import { addDays, formatShort, parseDate, toISODate } from './dates'
import { db, type Goal } from './db'
import { drawingAreaFor, listDrawingAreas, listDrawingLogs } from './drawing'
import { finishedIn, listMedia } from './media'
import { getEntriesBetween, getMeasurements } from './repo'
import { WEEKLY_LOSS_GOAL, type GoalMeasure } from './setup'
import { dsProgress, listSpanishLogs, videoMinutes } from './spanish'
import { goalWeight } from './stats'
import { alive, byOrder, newId, nextOrder, now, softDelete, update } from './store'
import { listTopics, studyProgress } from './study'

/** The progress lines a goal can show, by name. */
export const GOAL_MEASURES: Record<GoalMeasure, string> = {
  weight: 'Weight',
  fitness: 'Workouts',
  'food-rules': 'Food rules',
  drawing: 'Drawing',
  study: 'Tech study',
  spanish: 'Spanish',
  reading: 'Reading',
}

export async function listGoals(): Promise<Goal[]> {
  return alive(await db.goals.toArray()).sort(byOrder)
}

export interface GoalBranch {
  goal: Goal
  children: Goal[]
}

/** Goals with their sub-goals, in order. */
export function goalTree(goals: readonly Goal[]): GoalBranch[] {
  const ids = new Set(goals.map((goal) => goal.id))
  const isTop = (goal: Goal) => goal.parentId === null || !ids.has(goal.parentId)
  return goals.filter(isTop).map((goal) => ({ goal, children: goals.filter((child) => child.parentId === goal.id) }))
}

export async function addGoal(title: string, parentId: string | null): Promise<void> {
  await db.goals.put({ id: newId(), title, parentId, measure: null, notes: '', reached: null, order: await nextOrder(db.goals), updatedAt: now() })
}

export const updateGoal = (id: string, changes: Partial<Pick<Goal, 'title' | 'measure' | 'notes' | 'reached'>>) => update(db.goals, id, changes)

/** Deletes a goal with its sub-goals. */
export async function deleteGoal(id: string): Promise<void> {
  await db.transaction('rw', db.goals, async () => {
    for (const goal of alive(await db.goals.toArray())) {
      if (goal.id === id || goal.parentId === id) await softDelete(db.goals, goal.id)
    }
  })
}

/** Moves a goal one place up or down among the goals beside it. */
export async function moveGoal(id: string, step: -1 | 1): Promise<void> {
  await db.transaction('rw', db.goals, async () => {
    const goals = await listGoals()
    const goal = goals.find((candidate) => candidate.id === id)
    if (!goal) return
    const branch = goalTree(goals)
    const siblings = branch.some((top) => top.goal.id === id) ? branch.map((top) => top.goal) : goals.filter((other) => other.parentId === goal.parentId)
    const other = siblings[siblings.findIndex((candidate) => candidate.id === id) + step]
    if (!other) return
    const stamp = now()
    await db.goals.bulkPut([
      { ...goal, order: other.order, updatedAt: stamp },
      { ...other, order: goal.order, updatedAt: stamp },
    ])
  })
}

export interface GoalProgress {
  text: string
  /** The screen with the details. */
  href: string
}

const kg = (value: number) => `${value.toFixed(1)} kg`
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function weightText(weights: readonly { date: string; value: number }[]): string {
  if (!weights.length) return 'No weigh-ins yet. They go in on Saturdays, on Today.'
  const first = weights[0]
  const last = weights[weights.length - 1]
  const since = formatShort(parseDate(first.date))
  if (weights.length === 1) return `Started at ${kg(first.value)} on ${since}`
  const change = last.value - first.value
  const moved = Math.abs(change) < 0.05 ? 'No change' : change < 0 ? `Down ${kg(-change)}` : `Up ${kg(change)}`
  const pace = first.value - goalWeight(first, last.date, WEEKLY_LOSS_GOAL)
  return `${moved} since ${since} · goal pace: down ${kg(pace)}`
}

/** A progress line for each measure. "The last 4 weeks" are the 28 days up to today. */
export async function getGoalProgress(today: string): Promise<Record<GoalMeasure, GoalProgress>> {
  const from = toISODate(addDays(parseDate(today), -27))
  const [weights, entries, topics, spanishLogs, areas, drawingLogs, books] = await Promise.all([
    getMeasurements('weight'),
    getEntriesBetween(from, today),
    listTopics(),
    listSpanishLogs(),
    listDrawingAreas(),
    listDrawingLogs(),
    listMedia('book'),
  ])
  const daysWhere = (test: (key: string, value: unknown) => boolean) =>
    new Set(entries.filter((entry) => test(entry.key, entry.value)).map((entry) => entry.date)).size
  const ticked =
    (...ids: string[]) =>
    (key: string, value: unknown) =>
      value === true && ids.some((id) => key === `tick:${id}`)

  const study = studyProgress(topics, today)
  const ds = dsProgress(videoMinutes(spanishLogs))
  const area = drawingAreaFor(areas, drawingLogs, today)
  const year = today.slice(0, 4)
  const nextLevel = ds.nextLevel !== null && ds.hoursToNext !== null ? `, ${ds.hoursToNext.toFixed(1)} h to level ${ds.nextLevel}` : ''

  return {
    weight: { text: weightText(weights.filter((weight) => weight.date <= today)), href: '#/stats' },
    fitness: { text: `${count(daysWhere(ticked('workout')), 'workout')} in the last 4 weeks`, href: '#/stats' },
    'food-rules': {
      text: `Food rules kept on ${count(daysWhere((key, value) => key === 'rules' && value === 'kept'), 'day')} in the last 4 weeks`,
      href: '#/stats',
    },
    drawing: {
      text: `${count(daysWhere(ticked('drawing', 'drawing-study')), 'drawing day')} in the last 4 weeks${area ? ` · this week: ${area.name}` : ''}`,
      href: '#/drawing',
    },
    study: { text: `${study.done} of ${study.total} tech topics done`, href: '#/study' },
    spanish: { text: `${ds.hours.toFixed(1)} h of Dreaming Spanish · level ${ds.level}${nextLevel}`, href: '#/spanish' },
    reading: {
      text: `${count(finishedIn(books, year), 'book')} finished in ${year} · read on ${count(daysWhere(ticked('read')), 'day')} in the last 4 weeks`,
      href: '#/books',
    },
  }
}
