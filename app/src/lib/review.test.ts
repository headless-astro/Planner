import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { listCooked, listRecipes, setCooked } from './recipes'
import { ensureSeeded, getDayValues, listDoses, setEntry, setMeasurement, toggleTick } from './repo'
import { getWeekReview } from './review'
import { goalWeight } from './stats'
import { SPANISH_TRACK, TECH_TRACK } from './activities'
import { migrateToTracks } from './migrateTracks'
import { saveSession, updateStep } from './tracks'

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
    await migrateToTracks()
    await saveSession(SPANISH_TRACK, '2026-11-03', { minutes: 30 }, 'spanish-video')
    await saveSession(TECH_TRACK, '2026-11-02', { stepId: 'topic-1' }, 'tech')
    await updateStep('topic-1', { doneDate: '2026-11-02' })
    await setMeasurement('2026-11-07', 'weight', 80)
    await setEntry('2026-11-02', 'review', 'Good start')

    await setEntry('2026-11-02', 'review:next', 'Cook on Sunday')
    await setEntry('2026-11-09', 'review:well', 'Walked twice')
    await setEntry('2026-11-10', 'energy', '3')
    await setEntry('2026-11-11', 'energy', '2')

    const week = await getWeekReview('2026-11-02', '2026-11-08')
    expect(week.habits.find((row) => row.id === 'fitness')?.weeks.at(-1)?.count).toBe(2)
    expect(week).toMatchObject({ workAverage: 2.5, oldNotes: 'Good start', reviewed: false })
    expect(week.tracks).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Tech study', days: 1, steps: 1 }), expect.objectContaining({ name: 'Spanish', days: 1, minutes: 30 })]),
    )
    expect(week.weighIns).toEqual([{ date: '2026-11-07', value: 80 }])
    expect(week.wentWell).toEqual(expect.arrayContaining(['Tech study: 1 day (1 step)', 'Spanish: 1 day (30 min)']))

    // The next week picks up last week's "one thing".
    const next = await getWeekReview('2026-11-09', '2026-11-11')
    expect(next).toMatchObject({ lastWeekNext: 'Cook on Sunday', energyAverage: 2.5, periodDays: null })
    expect(next.notes['review:well']).toBe('Walked twice')
    // Doses so far: every dose on Monday to Wednesday.
    expect(next.meds.of).toBe((await listDoses()).length * 3)
  })
})

describe('goal pace', () => {
  it('works out the goal pace: 0.4 kg a week from the first weigh-in', () => {
    expect(goalWeight({ date: '2026-11-07', value: 80 }, '2026-12-05', 0.4)).toBeCloseTo(78.4)
  })
})
