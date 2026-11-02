// Date helpers. The planner's day runs 06:00 → 06:00 (PLAN.md D24): anything logged
// before 6 in the morning still belongs to the day you're closing.

export const DAY_START_HOUR = 6

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
const SHORT_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The planner day a moment belongs to, as a local date at midnight. */
export function plannerDate(now: Date = new Date()): Date {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (now.getHours() < DAY_START_HOUR) day.setDate(day.getDate() - 1)
  return day
}

/** Today's planner day as "YYYY-MM-DD". */
export function todayISO(now: Date = new Date()): string {
  return toISODate(plannerDate(now))
}

/** Monday = 0 … Sunday = 6. Weeks start on Monday. */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** The Monday of the week a date is in. */
export function weekStart(date: Date): Date {
  return addDays(date, -weekdayIndex(date))
}

/** "2026-11-02" → that local date. */
export function parseDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** A local date → "YYYY-MM-DD". */
export function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Whole days from a to b. Safe across daylight-saving changes. */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((ub - ua) / 86_400_000)
}

/** 1-based week number counted from a start date; 0 or less means before the start. */
export function weekSince(start: Date, date: Date): number {
  return Math.floor(daysBetween(start, date) / 7) + 1
}

/** DD/MM/YYYY */
export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear()}`
}

/** "Mon 2 Nov" */
export function formatShort(date: Date): string {
  return `${SHORT_WEEKDAYS[weekdayIndex(date)]} ${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`
}
