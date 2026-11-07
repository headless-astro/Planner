import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  addDose,
  addTodo,
  deleteDose,
  deleteHabit,
  ensureSeeded,
  getDayMeasurements,
  getDayValues,
  getTargets,
  getTodos,
  listDoses,
  listHabits,
  moveDose,
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

describe('the skin routine', () => {
  it('becomes a habit, keeping its target and every tick it had', async () => {
    await db.delete()
    await db.open()
    // A device set up before, with its skin target changed to 5.
    for (const id of ['seeded', 'seeded-m3', 'seeded-m4', 'seeded-m5']) await db.meta.put({ id, value: 1 })
    await db.settings.put({ id: 'targets', value: { skin: 5 }, updatedAt: 1 })
    await toggleTick('2026-11-02', 'skin')
    await ensureSeeded()
    expect(await listHabits()).toContainEqual(expect.objectContaining({ id: 'skin', label: 'Skin routine', weeklyTarget: 5 }))
    expect((await listHabits())[0].id).toBe('skin')
    expect((await getDayValues('2026-11-02'))['tick:skin']).toBe(true)
    // Deleting it sticks: it isn't added again.
    await deleteHabit('skin')
    await ensureSeeded()
    expect((await listHabits()).map((habit) => habit.id)).not.toContain('skin')
  })
})
