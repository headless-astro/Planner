import { describe, expect, it } from 'vitest'
import { parseDate } from './dates'
import { ALL_FEATURES, FRESH_FEATURES, FRESH_WEEK, dayWithFeatures } from './features'
import { buildDay } from './plan'
import { WEEK_TEMPLATE } from './setup'
import { weekCounters } from './week'

const monday = parseDate('2026-11-02')

describe('what you use', () => {
  it('takes the parts that are off out of a day', () => {
    const off = { ...ALL_FEATURES, exercise: false, food: false, body: false }
    expect(dayWithFeatures(WEEK_TEMPLATE[5], off)).toMatchObject({ workout: 'rest', foodRules: false, weighIn: false })
  })

  it("leaves them out of Today and the week's counts", () => {
    const plan = buildDay(monday, { features: { ...ALL_FEATURES, exercise: false } })
    const ids = [...plan.morning, ...plan.anytime].map((item) => item.id)
    expect(ids).not.toContain('workout')
    expect(ids).not.toContain('skin')
    const labels = weekCounters([], [], { rules: 6, fitness: 6, spanish: 4, study: 2, snackBudget: 200, weeklyLoss: 0.4 }, 0, FRESH_FEATURES).map(
      (counter) => counter.label,
    )
    expect(labels).toEqual([])
  })

  it('shows your own morning slot on Today', () => {
    const week = WEEK_TEMPLATE.map((day, index) => (index === 0 ? { ...day, morning: 'custom' as const, morningText: 'Guitar, 20 min' } : day))
    expect(buildDay(monday, { week }).morning.map((item) => item.label)).toContain('Guitar, 20 min')
  })

  it('starts someone new with an empty week', () => {
    const plan = buildDay(monday, { week: FRESH_WEEK, doses: [], tracks: [], features: FRESH_FEATURES })
    expect([...plan.morning, ...plan.anytime, ...plan.evening]).toEqual([])
    expect(plan.foodRules).toBe(false)
  })
})
