import { beforeEach, describe, expect, it } from 'vitest'
import { parseDate } from './dates'
import { db } from './db'
import { buildDay, daysWith } from './plan'
import { ensureSeeded, getAppearance, getFoodRules, getWeek, resetWeek, updateAppearance, updateFoodRules, updateWeekDay } from './repo'
import { DEFAULT_FOOD_RULES, WEEK_TEMPLATE } from './setup'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded()
})

describe('the week (F30)', () => {
  it('starts as the planned rhythm and changes day by day', async () => {
    expect(await getWeek()).toEqual(WEEK_TEMPLATE)
    await updateWeekDay(1, { morning: 'tech', spanish: null })
    await updateWeekDay(6, { foodRules: true })
    const week = await getWeek()
    expect(week[1]).toMatchObject({ morning: 'tech', workout: 'cardio', spanish: null })
    expect(daysWith(week, 'tech')).toEqual([0, 1, 2])

    // Tuesday 3 Nov is built from the changed week.
    const tuesday = buildDay(parseDate('2026-11-03'), { week })
    expect(tuesday.morning.map((item) => item.id)).toContain('study')
    expect(tuesday.anytime.find((item) => item.id === 'spanish')).toBeUndefined()
    expect(buildDay(parseDate('2026-11-08'), { week }).foodRules).toBe(true)

    await resetWeek()
    expect(await getWeek()).toEqual(WEEK_TEMPLATE)
  })
})

describe('food rules (F29) and colours (F28)', () => {
  it('start from the plan and can be changed', async () => {
    expect(await getFoodRules()).toEqual(DEFAULT_FOOD_RULES)
    await updateFoodRules(['Three meals', 'No junk'])
    expect(await getFoodRules()).toEqual(['Three meals', 'No junk'])

    expect((await getAppearance()).palette).toBe('lavender')
    await updateAppearance({ palette: 'mint' })
    expect((await getAppearance()).palette).toBe('mint')
  })
})
