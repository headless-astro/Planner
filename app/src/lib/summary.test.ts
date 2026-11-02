import { describe, expect, it } from 'vitest'
import { WEEK_TEMPLATE } from './setup'
import { comingDays, dayLabel, nextDayWhere, trackNow } from './summary'

// Monday 2 Nov 2026.
const today = '2026-11-02'

describe('plan summaries', () => {
  it('names the coming days', () => {
    expect(comingDays(today).map((date) => dayLabel(date, today))).toEqual([
      'Today',
      'Tomorrow',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
  })

  it('finds the next day of a kind in the week', () => {
    expect(nextDayWhere(WEEK_TEMPLATE, today, (day) => day.morning === 'tech')).toBe('2026-11-02')
    expect(nextDayWhere(WEEK_TEMPLATE, today, (day) => day.morning === 'drawing')).toBe('2026-11-06')
    expect(nextDayWhere(WEEK_TEMPLATE, '2026-11-07', (day) => day.morning === 'spanish-book')).toBe('2026-11-10')
    expect(nextDayWhere(WEEK_TEMPLATE, today, () => false)).toBeNull()
  })

  it('says where a practice track is and when it is next', () => {
    const track = { start: '2026-11-07', weeks: 4, weekdays: [5], focus: ['Parking', 'Roundabouts'] }
    expect(trackNow(track, today)).toEqual({ state: 'upcoming', status: 'Starts Sat 7 Nov', focus: 'Parking', next: '2026-11-07' })
    expect(trackNow(track, '2026-11-15')).toEqual({ state: 'running', status: 'Week 2 of 4', focus: 'Roundabouts', next: '2026-11-21' })
    expect(trackNow(track, '2026-12-05')).toMatchObject({ state: 'finished', next: null })
    // The last practice day has passed, but the track's last week hasn't ended.
    expect(trackNow(track, '2026-12-04')).toMatchObject({ state: 'running', next: null })
  })
})
