// Goals (PLAN.md 1.8, F17): the goal tree from the spreadsheet, with a progress line for each
// goal that's filled in from what you log.
import { addDays, formatShort, parseDate, toISODate } from './dates'
import { DRAWING_TRACK, SPANISH_TRACK, TECH_TRACK } from './activities'
import { db, type Goal, type Track } from './db'
import { finishedIn, listMedia } from './media'
import { getEntriesBetween, getMeasurements, getTargets } from './repo'
import type { GoalMeasure } from './setup'
import { goalWeight } from './stats'
import { alive, byOrder, newId, nextOrder, now, softDelete, update } from './store'
import { focusFor, hoursOf, listSessions, listTracks, milestoneProgress, stepsOf } from './tracks'
import { countText, eatingScore } from './week'

/** The progress lines from what you log, by name. Each track adds its own (F69). */
export const GOAL_MEASURES: Record<'weight' | 'fitness' | 'food-rules' | 'reading', string> = {
  weight: 'Weight',
  fitness: 'Workouts',
  'food-rules': 'Food guidelines',
  reading: 'Reading',
}

/** Goals from before pointed at tech study, Spanish or drawing; they follow those tracks now. */
const OLD_MEASURES: Record<string, string> = { study: TECH_TRACK, spanish: SPANISH_TRACK, drawing: DRAWING_TRACK }

/** The track a measure follows, if it's a track's. */
export function measureTrack(measure: GoalMeasure): string | null {
  if (measure.startsWith('track:')) return measure.slice('track:'.length)
  return OLD_MEASURES[measure] ?? null
}

/** Every progress line a goal can pick: the fixed ones, then one per track. */
export function goalMeasures(tracks: readonly Pick<Track, 'id' | 'name'>[]): [GoalMeasure, string][] {
  return [...(Object.entries(GOAL_MEASURES) as [GoalMeasure, string][]), ...tracks.map((track) => [`track:${track.id}`, track.name] as [GoalMeasure, string])]
}

/** What a track's goal target means: steps, hours or sessions. */
export const trackTargetMeaning = (track: Pick<Track, 'steps' | 'milestones'>) =>
  track.milestones ? 'hours' : track.steps ? 'steps done' : 'days in 4 weeks'

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

export const updateGoal = (id: string, changes: Partial<Pick<Goal, 'title' | 'measure' | 'notes' | 'reached' | 'target'>>) => update(db.goals, id, changes)

/** What a goal's target means, for the fixed progress lines (F58); tracks say theirs. */
export const GOAL_TARGETS: Record<'weight' | 'fitness' | 'food-rules' | 'reading', string> = {
  weight: 'kg to reach',
  fitness: 'workouts in 4 weeks',
  'food-rules': 'days in 4 weeks',
  reading: 'books this year',
}

/** What a goal's target means, whatever its progress line. */
export function targetMeaning(measure: GoalMeasure, tracks: readonly Track[]): string {
  if (measure in GOAL_TARGETS) return GOAL_TARGETS[measure as keyof typeof GOAL_TARGETS]
  const track = tracks.find((candidate) => candidate.id === measureTrack(measure))
  return track ? trackTargetMeaning(track) : ''
}

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
  /** The headline, shown large: "79.6 kg", "9 workouts" (F58). */
  value: string
  text: string
  /** The screen with the details. */
  href: string
  /** The number behind the headline, for the progress bar. */
  amount: number | null
  /** Where it started (weight), so a bar can run from there to the target. */
  start?: number
}

/** How far along a goal is towards its target, 0–100; null without a target or a number. */
export function goalPercent(target: number | null | undefined, progress: GoalProgress | undefined): number | null {
  if (target == null || !progress || progress.amount === null) return null
  if (progress.start !== undefined) {
    // From where it started to the target, either way (down for weight loss).
    if (progress.start === target) return 100
    return Math.round(Math.max(0, Math.min(1, (progress.start - progress.amount) / (progress.start - target))) * 100)
  }
  return target > 0 ? Math.round(Math.min(1, progress.amount / target) * 100) : null
}

const kg = (value: number) => `${value.toFixed(1)} kg`
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function weightText(weights: readonly { date: string; value: number }[], pace: number | null): string {
  if (!weights.length) return 'No weigh-ins yet. They go in on Saturdays, on Today.'
  const first = weights[0]
  const last = weights[weights.length - 1]
  const since = formatShort(parseDate(first.date))
  if (weights.length === 1) return `Started at ${kg(first.value)} on ${since}`
  const change = last.value - first.value
  const moved = Math.abs(change) < 0.05 ? 'No change' : change < 0 ? `Down ${kg(-change)}` : `Up ${kg(change)}`
  if (pace === null) return `${moved} since ${since}`
  return `${moved} since ${since} · goal pace: down ${kg(first.value - goalWeight(first, last.date, pace))}`
}

/** A progress line for each measure. "The last 4 weeks" are the 28 days up to today. */
export async function getGoalProgress(today: string): Promise<Partial<Record<GoalMeasure, GoalProgress>>> {
  const from = toISODate(addDays(parseDate(today), -27))
  const [weights, entries, topics, sessions, tracks, books, targets] = await Promise.all([
    getMeasurements('weight'),
    getEntriesBetween(from, today),
    db.topics.toArray().then(alive),
    listSessions(),
    listTracks(),
    listMedia('book'),
    getTargets(),
  ])
  const daysWhere = (test: (key: string, value: unknown) => boolean) =>
    new Set(entries.filter((entry) => test(entry.key, entry.value)).map((entry) => entry.date)).size
  const ticked =
    (...ids: string[]) =>
    (key: string, value: unknown) =>
      value === true && ids.some((id) => key === `tick:${id}`)

  // Mostly counts as a day, Partly as half (D74).
  const eatingDays = countText(entries.filter((entry) => entry.key === 'rules').reduce((sum, entry) => sum + eatingScore(entry.value), 0))
  const year = today.slice(0, 4)

  const pastWeights = weights.filter((weight) => weight.date <= today)
  const latest = pastWeights[pastWeights.length - 1]
  const workouts = daysWhere(ticked('workout'))
  const booksThisYear = finishedIn(books, year)

  // Each track's line: hours toward its milestones, or steps done, or days in the last 4 weeks.
  const trackLines: Partial<Record<GoalMeasure, GoalProgress>> = {}
  for (const track of tracks) {
    const own = sessions.filter((session) => session.trackId === track.id)
    const href = `#/track/${track.id}`
    let line: GoalProgress
    if (track.milestones) {
      const progress = milestoneProgress(hoursOf(own), track.milestones)
      const next = progress.next && progress.hoursToNext !== null ? `${progress.hoursToNext.toFixed(1)} h to ${progress.next.name}` : ''
      line = { value: `${progress.hours.toFixed(1)} h`, text: [progress.reached ?? '', next].filter(Boolean).join(' · ') || 'logged so far', href, amount: progress.hours }
    } else if (track.steps) {
      const steps = stepsOf(track.id, topics)
      const done = steps.filter((step) => step.doneDate).length
      line = { value: `${done} of ${steps.length}`, text: 'steps done', href, amount: done }
    } else {
      const days = new Set(own.filter((session) => session.date >= from && session.date <= today).map((session) => session.date)).size
      const focus = focusFor(track, own, today)
      line = { value: count(days, 'day'), text: `in the last 4 weeks${focus ? ` · this week: ${focus.name}` : ''}`, href, amount: days }
    }
    trackLines[`track:${track.id}`] = line
    for (const [old, id] of Object.entries(OLD_MEASURES)) if (id === track.id) trackLines[old as GoalMeasure] = line
  }

  return {
    ...trackLines,
    weight: {
      value: latest ? kg(latest.value) : '–',
      text: weightText(pastWeights, targets.weeklyLoss ?? null),
      href: '#/insights',
      amount: latest?.value ?? null,
      start: pastWeights[0]?.value,
    },
    fitness: { value: count(workouts, 'workout'), text: 'in the last 4 weeks', href: '#/insights', amount: workouts },
    'food-rules': {
      value: `${eatingDays} ${eatingDays === '1' ? 'day' : 'days'}`,
      text: 'food guidelines mostly followed, in the last 4 weeks',
      href: '#/insights',
      amount: entries.filter((entry) => entry.key === 'rules').reduce((sum, entry) => sum + eatingScore(entry.value), 0),
    },
    reading: {
      value: count(booksThisYear, 'book'),
      text: `finished in ${year} · read on ${count(daysWhere(ticked('read')), 'day')} in the last 4 weeks`,
      href: '#/books',
      amount: booksThisYear,
    },
  }
}
