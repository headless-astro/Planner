// The short "now and next" lines on the Plans tab (F33). Plain functions, so they're easy to test.
import { WEEKDAYS, addDays, daysBetween, formatShort, parseDate, toISODate, weekdayIndex } from './dates'
import type { DayTemplate } from './setup'

/** "Today", "Tomorrow", or the weekday for the rest of the coming week. */
export function dayLabel(date: string, today: string): string {
  const days = daysBetween(parseDate(today), parseDate(date))
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days > 1 && days < 7) return WEEKDAYS[weekdayIndex(parseDate(date))]
  return formatShort(parseDate(date))
}

/** The next date, from today on, within a week, whose day in the week passes the test. */
export function nextDayWhere(week: readonly DayTemplate[], today: string, test: (day: DayTemplate) => boolean): string | null {
  for (let offset = 0; offset < 7; offset++) {
    const date = addDays(parseDate(today), offset)
    const day = week[weekdayIndex(date)]
    if (day && test(day)) return toISODate(date)
  }
  return null
}

/** Today and the days after it: a week by default. */
export function comingDays(today: string, length = 7): string[] {
  return Array.from({ length }, (_, offset) => toISODate(addDays(parseDate(today), offset)))
}
