import { beforeEach, describe, expect, it } from 'vitest'
import { db, type Routine, type RoutineLog } from './db'
import { ensureSeeded, getDayValues } from './repo'
import { dueText, getRoutineStatuses, routineStatus, setRoutineDone } from './routines'

const vacuum: Routine = { id: 'routine-vacuum', name: 'Vacuum', area: 'Cleaning', intervalDays: 5, order: 0, updatedAt: 0 }
const doneOn = (date: string): RoutineLog => ({ id: `routine-vacuum|${date}`, routineId: 'routine-vacuum', date, updatedAt: 1 })

describe('routineStatus', () => {
  it('is "not started" until it has been done once', () => {
    const status = routineStatus(vacuum, [], '2026-11-02')
    expect(status).toMatchObject({ lastDone: null, dueIn: null, count: 0 })
    expect(dueText(status)).toBe('not started')
  })

  it('counts from the last time it was done', () => {
    const status = routineStatus(vacuum, [doneOn('2026-10-25'), doneOn('2026-10-30')], '2026-11-02')
    expect(status).toMatchObject({ lastDone: '2026-10-30', nextDue: '2026-11-04', dueIn: 2, count: 2, averageGap: 5 })
    expect(dueText(status)).toBe('due in 2 days')
  })

  it('says how late it is', () => {
    expect(dueText(routineStatus(vacuum, [doneOn('2026-10-25')], '2026-11-02'))).toBe('3 days late')
    expect(dueText(routineStatus(vacuum, [doneOn('2026-10-28')], '2026-11-02'))).toBe('due today')
  })

  it('ignores completions after the date it looks from', () => {
    expect(routineStatus(vacuum, [doneOn('2026-11-05')], '2026-11-02').lastDone).toBeNull()
  })
})

describe('setRoutineDone', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureSeeded()
  })

  const statusOf = async (id: string) => (await getRoutineStatuses('2026-11-02')).find((status) => status.routine.id === id)

  it('marks a cleaning routine done and ticks Chores (D17)', async () => {
    await setRoutineDone('routine-vacuum', '2026-11-02', true)
    expect((await statusOf('routine-vacuum'))?.doneThatDay).toBe(true)
    expect((await getDayValues('2026-11-02'))['tick:chores']).toBe(true)
  })

  it('leaves Chores alone for self-care routines', async () => {
    await setRoutineDone('routine-mask', '2026-11-02', true)
    expect((await getDayValues('2026-11-02'))['tick:chores']).toBeUndefined()
  })

  it('can be undone', async () => {
    await setRoutineDone('routine-mask', '2026-11-02', true)
    await setRoutineDone('routine-mask', '2026-11-02', false)
    expect((await statusOf('routine-mask'))?.lastDone).toBeNull()
  })
})
