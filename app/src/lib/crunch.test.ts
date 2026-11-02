import { beforeEach, describe, expect, it } from 'vitest'
import { countCrunchDays, endCrunch, isCrunchDay, listCrunches, startCrunch } from './crunch'
import { db } from './db'
import { DEFAULT_TARGETS } from './setup'
import { weekCounters } from './week'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('crunch days', () => {
  it('run from the start until ended, the last day included', async () => {
    await startCrunch('2026-11-03')
    expect(isCrunchDay(await listCrunches(), '2026-11-20')).toBe(true)

    await endCrunch('2026-11-05')
    const crunches = await listCrunches()
    expect(isCrunchDay(crunches, '2026-11-02')).toBe(false)
    expect(isCrunchDay(crunches, '2026-11-05')).toBe(true)
    expect(isCrunchDay(crunches, '2026-11-06')).toBe(false)
    expect(countCrunchDays(crunches, '2026-11-02', '2026-11-08')).toBe(3)
  })

  it('come out of the weekly targets (D20)', () => {
    const fitnessTarget = (crunchDays: number) =>
      weekCounters([], [], DEFAULT_TARGETS, crunchDays).find((counter) => counter.id === 'fitness')?.target
    expect(fitnessTarget(0)).toBe(6)
    expect(fitnessTarget(2)).toBe(5)
    expect(fitnessTarget(7)).toBe(0)
  })
})
