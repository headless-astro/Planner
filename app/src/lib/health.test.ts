import { describe, expect, it } from 'vitest'
import type { Entry } from './db'
import { measureSummary, weekTallies } from './health'
import { WEEK_TEMPLATE } from './setup'

const entry = (date: string, key: string, value: unknown): Entry => ({ id: `${date}|${key}`, date, key, value, updatedAt: 1 })

describe('health summary', () => {
  it('gives the latest measurement and the change since the first', () => {
    expect(measureSummary([], '2026-11-07')).toBeNull()
    expect(
      measureSummary(
        [
          { date: '2026-10-31', value: 80 },
          { date: '2026-11-07', value: 79.4 },
          { date: '2026-11-14', value: 79 },
        ],
        '2026-11-07',
      ),
    ).toMatchObject({ latest: { date: '2026-11-07', value: 79.4 }, change: 79.4 - 80, since: '2026-10-31', step: -0.6, previous: '2026-10-31' })
  })

  it("counts this week's workouts, doses and food rules so far", () => {
    // Wednesday 4 Nov: three days so far.
    const entries = [
      entry('2026-11-02', 'tick:workout', true),
      entry('2026-11-03', 'tick:workout', true),
      entry('2026-11-02', 'tick:med-a', true),
      entry('2026-11-03', 'tick:med-a', true),
      entry('2026-11-03', 'tick:med-b', true),
      entry('2026-11-04', 'tick:med-b', false),
      entry('2026-11-02', 'rules', 'kept'),
      entry('2026-11-03', 'rules', 'slip'),
      entry('2026-10-30', 'tick:workout', true),
    ]
    expect(weekTallies(entries, WEEK_TEMPLATE, ['med-a', 'med-b'], '2026-11-04')).toEqual({
      workouts: { done: 2, of: 6 },
      meds: { done: 3, of: 6 },
      foodRules: { done: 1, of: 3 },
    })
  })
})
