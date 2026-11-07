import { describe, expect, it } from 'vitest'
import { WEEK_TEMPLATE } from './setup'
import { comingDays, dayLabel, nextDayWhere } from './summary'

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
})
