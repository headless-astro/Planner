import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { listCooked, listRecipes, setCooked } from './recipes'
import { ensureSeeded, getDayValues, setEntry, setMeasurement, toggleTick } from './repo'
import { getWeekReview } from './review'
import { saveDayLog } from './spanish'
import { getStats, goalWeight } from './stats'
import { listTopics, setTopicDone } from './study'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded()
})

describe('recipes', () => {
  it('starts with your go-to meals, and cooking one ticks Cooked', async () => {
    const recipes = await listRecipes()
    expect(recipes).toHaveLength(11)
    await setCooked(recipes[0].id, '2026-11-02', true)
    expect(await listCooked()).toHaveLength(1)
    expect((await getDayValues('2026-11-02'))['tick:cooked']).toBe(true)
  })
})

describe('weekly review', () => {
  it('sums up one week', async () => {
    await toggleTick('2026-11-02', 'workout')
    await toggleTick('2026-11-04', 'workout')
    await setEntry('2026-11-02', 'work', '2')
    await setEntry('2026-11-03', 'work', '3')
    await setEntry('2026-11-04', 'work', '–')
    await saveDayLog('2026-11-03', 'video', { minutes: 30 })
    await setTopicDone((await listTopics())[0].id, '2026-11-02', true)
    await setMeasurement('2026-11-07', 'weight', 80)
    await setEntry('2026-11-02', 'review', 'Good start')

    const week = await getWeekReview('2026-11-02')
    expect(week.counters.find((counter) => counter.id === 'fitness')?.count).toBe(2)
    expect(week).toMatchObject({ studySessions: 1, spanishMinutes: 30, workAverage: 2.5, notes: 'Good start' })
    expect(week.weighIns).toEqual([{ date: '2026-11-07', value: 80 }])
  })
})

describe('stats', () => {
  it('counts logged days from the first one, with no check-in needed', async () => {
    await toggleTick('2026-11-02', 'skin')
    await setEntry('2026-11-04', 'work', '2')
    const stats = await getStats('2026-11-05')
    expect(stats).toMatchObject({ since: '2026-11-02', days: 4, logged: 2, workAverage: 2, workDays: 1 })
    expect(stats.weeks).toHaveLength(4)
  })

  it('works out the goal pace: 0.4 kg a week from the first weigh-in', () => {
    expect(goalWeight({ date: '2026-11-07', value: 80 }, '2026-12-05', 0.4)).toBeCloseTo(78.4)
  })
})
