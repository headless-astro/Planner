import { beforeEach, describe, expect, it } from 'vitest'
import { DRAWING_TRACK } from './activities'
import { db, type Track } from './db'
import { addExtra, countsAsChoices, extrasOf, removeExtra } from './extras'
import { ALL_FEATURES } from './features'
import { getDayValues, getEntriesBetween, listHabits, setEntry, getTargets } from './repo'
import { WEEK_TEMPLATE } from './setup'
import { weekCounters } from './week'

const track = (fields: Partial<Track> & Pick<Track, 'id' | 'name'>): Track => ({ start: '2026-11-02', weeks: 0, ongoing: true, weekdays: [], focus: [], order: 0, updatedAt: 0, ...fields })

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('added to one day only (F79)', () => {
  it('keeps extras as a value for the day, and takes them off again', async () => {
    await addExtra('2026-11-08', undefined, { part: 'evening', counts: 'workout', note: '' })
    let extras = extrasOf((await getDayValues('2026-11-08')).extras)
    expect(extras).toEqual([{ id: expect.any(String), part: 'evening', counts: 'workout' }])
    await removeExtra('2026-11-08', extras, extras[0].id)
    extras = extrasOf((await getDayValues('2026-11-08')).extras)
    expect(extras).toEqual([])
    expect('extras' in (await getDayValues('2026-11-08'))).toBe(false)
  })

  it('a workout ticked on the rest day counts for Fitness', async () => {
    await addExtra('2026-11-08', undefined, { part: 'anytime', counts: 'workout' })
    await setEntry('2026-11-08', 'tick:workout', true)
    const counters = weekCounters(await getEntriesBetween('2026-11-02', '2026-11-08'), await listHabits(), await getTargets(), 0, ALL_FEATURES)
    expect(counters.find((counter) => counter.id === 'fitness')?.count).toBe(1)
  })

  it('offers the workout only on a day without one, running tracks, and your own activities', () => {
    const week = WEEK_TEMPLATE.map((day, index) => ({ ...day, activities: index === 0 ? [{ id: 'g', part: 'evening' as const, text: 'Guitar', log: 'minutes' as const }] : [] }))
    const tracks = [track({ id: DRAWING_TRACK, name: 'Drawing study' }), track({ id: 'old', name: 'Old course', ongoing: false, weeks: 1, start: '2026-01-05' })]
    const choices = countsAsChoices('2026-11-08', { week, tracks, exercise: true, onDay: new Set() })
    expect(choices.map((choice) => choice.label)).toEqual(['Workout (counts for Fitness)', 'Guitar', 'Drawing study (a session)'])
    expect(choices.find((choice) => choice.value === 'act:guitar')?.extra).toEqual({ counts: 'own', text: 'Guitar', log: 'minutes' })
    const busy = countsAsChoices('2026-11-02', { week, tracks, exercise: true, onDay: new Set(['workout', 'act:guitar']) })
    expect(busy.map((choice) => choice.value)).toEqual([`track:${DRAWING_TRACK}`])
    expect(countsAsChoices('2026-11-08', { week, tracks: [], exercise: false, onDay: new Set() }).map((choice) => choice.value)).toEqual(['act:guitar'])
  })

  it('offers a weigh-in on a day without one, when weigh-ins are on', () => {
    const week = WEEK_TEMPLATE.map((day) => ({ ...day, activities: [] }))
    const values = (body: boolean, onDay: string[] = []) =>
      countsAsChoices('2026-11-04', { week, tracks: [], exercise: false, body, onDay: new Set(onDay) }).map((choice) => choice.value)
    expect(values(true)).toEqual(['weigh-in'])
    expect(values(true, ['weigh-in'])).toEqual([])
    expect(values(false)).toEqual([])
    expect(extrasOf([{ id: 'w', part: 'morning', counts: 'weigh-in' }])).toEqual([{ id: 'w', part: 'morning', counts: 'weigh-in' }])
  })

  it('leaves out anything malformed', () => {
    expect(extrasOf([{ id: 'a', part: 'morning', counts: 'workout' }, { id: 1 }, 'x', null, { id: 'b', counts: 'nope' }])).toEqual([{ id: 'a', part: 'morning', counts: 'workout' }])
    expect(extrasOf('nope')).toEqual([])
  })
})
