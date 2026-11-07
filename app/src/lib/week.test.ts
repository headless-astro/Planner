import { describe, expect, it } from 'vitest'
import type { Entry, Habit } from './db'
import { DEFAULT_TARGETS } from './setup'
import { countText, eatingScore, eatingText, weekCounters } from './week'

const entry = (date: string, key: string, value: unknown): Entry => ({ id: `${date}|${key}`, date, key, value, updatedAt: 1 })
const habit = (id: string, label: string, weeklyTarget: number | null): Habit => ({ id, label, weeklyTarget, order: 0, updatedAt: 0 })

describe('weekCounters', () => {
  const entries = [
    entry('2026-11-02', 'tick:workout', true),
    entry('2026-11-03', 'tick:workout', true),
    entry('2026-11-04', 'tick:workout', false),
    entry('2026-11-02', 'tick:spanish', true),
    entry('2026-11-02', 'tick:spanish-book', true),
    entry('2026-11-02', 'rules', 'kept'),
    entry('2026-11-03', 'rules', 'slip'),
    entry('2026-11-06', 'tick:drawing-study', true),
  ]
  const counters = Object.fromEntries(weekCounters(entries, [habit('drawing', 'Drawing', 1), habit('crafts', 'Crafts', null)], DEFAULT_TARGETS).map((c) => [c.id, c]))

  it('counts days, not ticks', () => {
    expect(counters.fitness).toMatchObject({ count: 2, target: 6 })
    // Spanish and tech study are tracks now: counted from their sessions on the week.
    expect(counters.spanish).toBeUndefined()
  })

  it('counts only days the food rules were kept', () => {
    expect(counters.rules.count).toBe(1)
  })

  it('counts the Friday drawing block toward the Drawing habit', () => {
    expect(counters.drawing).toMatchObject({ count: 1, target: 1 })
    expect(counters.crafts).toMatchObject({ count: 0, target: null })
  })
})

describe('food guidelines', () => {
  it('counts Mostly as a day and Partly as half', () => {
    expect([eatingScore('kept'), eatingScore('partly'), eatingScore('slip'), eatingScore(undefined)]).toEqual([1, 0.5, 0, 0])
    expect([countText(0), countText(0.5), countText(2), countText(2.5)]).toEqual(['0', '½', '2', '2½'])
    expect(eatingText('partly')).toBe('Eating: partly')
  })
})
