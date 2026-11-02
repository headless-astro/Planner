import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  addDose,
  addTodo,
  deleteDose,
  ensureSeeded,
  getDayMeasurements,
  getDaySummaries,
  getDayValues,
  getTargets,
  getTodos,
  listDoses,
  moveDose,
  setEntry,
  setMeasurement,
  setTodoDone,
  toggleTick,
  updateTargets,
} from './repo'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('ensureSeeded', () => {
  it('copies the starting setup once, with fixed ids', async () => {
    await ensureSeeded()
    await ensureSeeded()
    expect((await listDoses()).map((dose) => dose.id)).toEqual(['med-empty', 'med-breakfast', 'med-anytime', 'med-dinner'])
    expect(await db.doses.count()).toBe(4)
  })
})

describe('ticks', () => {
  it('toggles on and off', async () => {
    expect(await toggleTick('2026-11-02', 'workout')).toBe(true)
    expect((await getDayValues('2026-11-02'))['tick:workout']).toBe(true)
    expect(await toggleTick('2026-11-02', 'workout')).toBe(false)
    expect((await getDayValues('2026-11-02'))['tick:workout']).toBe(false)
  })
})

describe('to-dos', () => {
  it('carries unfinished to-dos over to today, but not ones planned for later', async () => {
    await addTodo('from yesterday', '2026-11-01')
    await addTodo('for Thursday', '2026-11-05')
    expect((await getTodos('2026-11-02', true)).map((todo) => todo.title)).toEqual(['from yesterday'])
  })

  it('shows a finished to-do on the day it was done, and only then', async () => {
    await addTodo('vacuum', '2026-11-01')
    const [todo] = await getTodos('2026-11-02', true)
    await setTodoDone(todo.id, true, '2026-11-02')
    expect((await getTodos('2026-11-02', true)).map((t) => t.title)).toEqual(['vacuum'])
    expect(await getTodos('2026-11-03', true)).toEqual([])
  })
})

describe('setup lists', () => {
  it('adds, reorders and deletes a dose', async () => {
    await ensureSeeded()
    await addDose('Meds · with lunch', 'anytime')
    const added = (await listDoses()).at(-1)!
    expect(added.label).toBe('Meds · with lunch')

    await moveDose(added.id, -1)
    expect((await listDoses()).map((dose) => dose.label).slice(-2)).toEqual(['Meds · with lunch', 'Meds · with dinner'])

    await deleteDose(added.id)
    expect((await listDoses()).map((dose) => dose.label)).not.toContain('Meds · with lunch')
    // Deleted records stay in the database, flagged, so the deletion can sync.
    expect((await db.doses.get(added.id))?.deleted).toBe(true)
  })

  it('keeps targets merged over the defaults', async () => {
    await ensureSeeded()
    await updateTargets({ snackBudget: 180 })
    expect(await getTargets()).toMatchObject({ snackBudget: 180, fitness: 6 })
  })
})

describe('measurements', () => {
  it('saves and clears a weigh-in', async () => {
    await setMeasurement('2026-11-07', 'weight', 80.5)
    expect(await getDayMeasurements('2026-11-07')).toEqual({ weight: 80.5 })
    await setMeasurement('2026-11-07', 'weight', null)
    expect(await getDayMeasurements('2026-11-07')).toEqual({})
  })
})

describe('getDaySummaries', () => {
  it('lists every day newest first, including empty ones', async () => {
    await setEntry('2026-11-01', 'work', '2')
    await toggleTick('2026-11-01', 'workout')
    const days = await getDaySummaries('2026-10-31', '2026-11-02')
    expect(days.map((day) => day.date)).toEqual(['2026-11-02', '2026-11-01', '2026-10-31'])
    expect(days[1]).toMatchObject({ work: '2', ticks: 1 })
    expect(days[0]).toMatchObject({ ticks: 0, work: null })
  })
})
