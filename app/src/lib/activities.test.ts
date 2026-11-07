import { describe, expect, it } from 'vitest'
import { DRAWING_TRACK, SPANISH_TRACK, TECH_TRACK, customKey, dayActivities, isReviewDay, scheduledThings, slug } from './activities'
import { WEEK_TEMPLATE } from './setup'

const driving = { id: 'track-driving', name: 'Driving practice', weekdays: [5] }
const tracks = [
  { id: TECH_TRACK, name: 'Tech study', weekdays: [] },
  { id: SPANISH_TRACK, name: 'Spanish', weekdays: [] },
  { id: DRAWING_TRACK, name: 'Drawing', weekdays: [] },
  driving,
]

describe('the week of activities (F70)', () => {
  it('works out a day from before from its slots, so nothing moves', () => {
    expect(dayActivities(WEEK_TEMPLATE[0], 0, tracks)).toEqual([
      { id: 'tech', part: 'morning', trackId: TECH_TRACK, log: 'step' },
      { id: 'spanish-video', part: 'anytime', trackId: SPANISH_TRACK, note: '1 video', log: 'minutes' },
    ])
    expect(dayActivities(WEEK_TEMPLATE[1], 1, tracks)[0]).toEqual({ id: 'spanish-book', part: 'morning', trackId: SPANISH_TRACK, note: 'Book', log: 'step' })
    expect(dayActivities(WEEK_TEMPLATE[5], 5, tracks).map((activity) => activity.id)).toEqual(['spanish-reading', 'track-track-driving'])
    expect(isReviewDay(WEEK_TEMPLATE[6])).toBe(true)
  })

  it('uses a day’s own activities once it has them', () => {
    const day = { ...WEEK_TEMPLATE[0], activities: [{ id: 'x', part: 'evening' as const, text: 'Guitar', log: 'done' as const }] }
    expect(dayActivities(day, 0, tracks)).toEqual(day.activities)
  })

  it('lists what the week holds, with the days each is on', () => {
    const things = scheduledThings(WEEK_TEMPLATE, tracks)
    expect(things.find((thing) => thing.trackId === TECH_TRACK)?.weekdays).toEqual([0, 2])
    // Spanish: video Mon–Thu, book Tue and Thu, exercises Fri, reading Sat: six days, counted once each.
    expect(things.find((thing) => thing.trackId === SPANISH_TRACK)?.weekdays).toEqual([0, 1, 2, 3, 4, 5])
    expect(things.find((thing) => thing.trackId === 'track-driving')?.weekdays).toEqual([5])
  })

  it('keeps your own activities by name, so the same one on two days counts together (D86)', () => {
    const own = (text: string) => ({ ...WEEK_TEMPLATE[6], activities: [{ id: Math.random().toString(), part: 'evening' as const, text, log: 'done' as const }] })
    const week = [own('Guitar, 20 min'), own('guitar, 20 MIN'), ...WEEK_TEMPLATE.slice(2).map((day) => ({ ...day, activities: [] }))]
    expect(scheduledThings(week, tracks)).toEqual([{ key: 'act:guitar-20-min', label: 'Guitar, 20 min', trackId: null, weekdays: [0, 1] }])
    expect(slug('Çalışma — 30 dk')).toBe('calısma-30-dk')
    expect(customKey('Read!')).toBe('act:read')
  })
})
