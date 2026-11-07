import { describe, expect, it } from 'vitest'
import type { Entry, Routine } from './db'
import { buildInsights, habitRows, type InsightsData } from './insights'
import { routineStatus } from './routines'
import { DEFAULT_TARGETS, WEEK_TEMPLATE } from './setup'

// Wednesday 25 Nov 2026; the week started on Monday 23 Nov.
const today = '2026-11-25'
const entry = (date: string, key: string, value: unknown): Entry => ({ id: `${date}|${key}`, date, key, value, updatedAt: 1 })
const workouts = (dates: string[]) => dates.map((date) => entry(date, 'tick:workout', true))

/** Every day from `from`, `count` days on. */
function daysFrom(from: string, count: number): string[] {
  const start = new Date(`${from}T12:00:00`)
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(start)
    day.setDate(start.getDate() + i)
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
  })
}

const base: InsightsData = {
  entries: [],
  habits: [],
  targets: { ...DEFAULT_TARGETS, fitness: 4 },
  crunches: [],
  routines: [],
  routineLogs: [],
  tasks: [],
  measurements: [],
  doses: [],
  week: WEEK_TEMPLATE,
  media: [],
  tracks: [],
  topics: [],
  spanishLogs: [],
  drawingLogs: [],
  trackSessions: [],
  otherDates: [],
  periodsOn: false,
}

describe('habit rows', () => {
  it('shows each week as % of the target, over 100 when you did more, and counts runs', () => {
    const mondays = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']
    const entries = workouts([
      ...daysFrom('2026-11-02', 2), // 2 of 4: 50%
      ...daysFrom('2026-11-09', 4), // 100%
      ...daysFrom('2026-11-16', 6), // 150%
      ...daysFrom('2026-11-23', 1), // this week so far
    ])
    const fitness = habitRows(entries, [], { ...DEFAULT_TARGETS, fitness: 4 }, [], mondays, '2026-11-23', '2026-11-02').find((row) => row.id === 'fitness')
    expect(fitness?.weeks.map((week) => week.percent)).toEqual([50, 100, 150, 25])
    expect(fitness?.weeks.at(-1)?.inProgress).toBe(true)
    // The week in progress is left out of the average and the runs.
    expect(fitness?.average).toBe(100)
    expect(fitness?.streak).toBe(2)
    expect(fitness?.under).toBe(0)
  })

  it('leaves weeks before the first log blank', () => {
    const rows = habitRows(workouts(['2026-11-17']), [], DEFAULT_TARGETS, [], ['2026-11-02', '2026-11-09', '2026-11-16'], null, '2026-11-17')
    expect(rows.find((row) => row.id === 'rules')?.weeks.map((week) => week.percent)).toEqual([null, null, 0])
    expect(rows.find((row) => row.id === 'rules')?.under).toBe(1)
  })
})

describe('Insights', () => {
  it('puts wins first: runs on target, finished things and routines done', () => {
    const entries = workouts([...daysFrom('2026-11-09', 4), ...daysFrom('2026-11-16', 5)])
    const media = [{ id: 'm', kind: 'book' as const, title: 'Dune', author: '', format: null, status: 'done' as const, started: '2026-11-01', finished: '2026-11-20', rating: null, notes: '', genre: '', order: 0, updatedAt: 0 }]
    const insights = buildInsights({ ...base, entries, media: media as never }, today, 'month')
    expect(insights.wins).toContain('Fitness on target 2 weeks running')
    expect(insights.wins).toContain('Finished 1 book')
    expect(insights.wins.some((win) => win.startsWith('Best week: from Mon 16 Nov'))).toBe(true)
  })

  it('only calls something slipping after 2 weeks under target', () => {
    const oneBadWeek = buildInsights({ ...base, entries: workouts([...daysFrom('2026-11-09', 4), ...daysFrom('2026-11-16', 1)]) }, today, 'month')
    expect(oneBadWeek.slipping.map((slip) => slip.text)).not.toContain('Fitness: under target 1 weeks running')
    expect(oneBadWeek.slipping.some((slip) => slip.text.startsWith('Fitness'))).toBe(false)
    const twoBadWeeks = buildInsights({ ...base, entries: workouts([...daysFrom('2026-11-09', 1), ...daysFrom('2026-11-16', 1)]) }, today, 'month')
    expect(twoBadWeeks.slipping.map((slip) => slip.text)).toContain('Fitness: under target 2 weeks running')
  })

  it('lists routines well past due, tasks past the deadline, or nothing', () => {
    const vacuum: Routine = { id: 'vacuum', name: 'Vacuum', area: 'Cleaning', intervalDays: 7, order: 0, updatedAt: 0 }
    const late = routineStatus(vacuum, [{ id: 'v', routineId: 'vacuum', date: '2026-11-10', updatedAt: 0 }], today)
    const task = { id: 't', title: 'Renew passport', date: null, due: '2026-11-20', listId: 'life', parentId: null, done: false, doneDate: null, order: 0, updatedAt: 0 }
    const insights = buildInsights({ ...base, routines: [late], tasks: [task] }, today, 'week')
    expect(insights.slipping.map((slip) => slip.text)).toEqual(['Vacuum: 8 days late', '1 task past the deadline: Renew passport'])
    expect(buildInsights(base, today, 'week').slipping).toEqual([])
  })

  it('sums up health: eating, energy, and period days only when tracked', () => {
    const entries = [
      entry('2026-11-23', 'rules', 'kept'),
      entry('2026-11-24', 'rules', 'partly'),
      entry('2026-11-25', 'rules', 'slip'),
      entry('2026-11-23', 'energy', '1'),
      entry('2026-11-24', 'energy', '3'),
      entry('2026-11-24', 'period', true),
    ]
    const off = buildInsights({ ...base, entries }, today, 'week')
    expect(off.health.eating).toEqual({ mostly: 1, partly: 1, notReally: 1 })
    expect(off.health.energy).toMatchObject({ average: 2, days: 2, low: 1, high: 1 })
    expect(off.health.periodDays).toBeNull()
    expect(off.periodDates).toEqual([])
    const on = buildInsights({ ...base, entries, periodsOn: true }, today, 'week')
    expect(on.health.periodDays).toBe(1)
    expect(on.periodDates).toEqual(['2026-11-24'])
  })

  it('gives the weight trend per week within the period', () => {
    const measurements = [
      { id: 'a', date: '2026-10-31', kind: 'weight' as const, value: 80, updatedAt: 0 },
      { id: 'b', date: '2026-11-14', kind: 'weight' as const, value: 79, updatedAt: 0 },
      { id: 'c', date: '2026-11-21', kind: 'weight' as const, value: 78.6, updatedAt: 0 },
    ]
    const insights = buildInsights({ ...base, measurements }, today, 'month')
    expect(insights.health.weightTrend).toBe('−0.5 kg a week since Sat 31 Oct')
    expect(buildInsights({ ...base, measurements }, today, 'week').health.weightTrend).toBeNull()
  })

  it('counts logged days, leaving out review notes', () => {
    const insights = buildInsights({ ...base, entries: [entry('2026-11-23', 'review:well', 'ok'), entry('2026-11-24', 'note', 'hi')] }, today, 'week')
    expect(insights.loggedDates).toEqual(['2026-11-24'])
  })
})
