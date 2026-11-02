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

/** Today and the six days after it. */
export function comingDays(today: string): string[] {
  return Array.from({ length: 7 }, (_, offset) => toISODate(addDays(parseDate(today), offset)))
}

export interface TrackLike {
  start: string
  weeks: number
  /** Monday = 0 … Sunday = 6. */
  weekdays: readonly number[]
  focus: readonly string[]
}

export interface TrackNow {
  state: 'upcoming' | 'running' | 'finished'
  /** "Starts Mon 9 Nov", "Week 2 of 4" or "Finished". */
  status: string
  /** This week's focus, while it runs. */
  focus: string | null
  /** The next practice day from today, or null once it's over. */
  next: string | null
}

export function trackNow(track: TrackLike, today: string): TrackNow {
  const start = parseDate(track.start)
  const end = toISODate(addDays(start, track.weeks * 7 - 1))
  const nextDay = () => {
    const from = today > track.start ? today : track.start
    for (let offset = 0; offset < 7; offset++) {
      const date = addDays(parseDate(from), offset)
      const iso = toISODate(date)
      if (iso > end) return null
      if (track.weekdays.includes(weekdayIndex(date))) return iso
    }
    return null
  }
  if (today > end) return { state: 'finished', status: 'Finished', focus: null, next: null }
  if (today < track.start) return { state: 'upcoming', status: `Starts ${formatShort(start)}`, focus: track.focus[0] ?? null, next: nextDay() }
  const week = Math.floor(daysBetween(start, parseDate(today)) / 7) + 1
  return { state: 'running', status: `Week ${week} of ${track.weeks}`, focus: track.focus[week - 1] ?? null, next: nextDay() }
}
