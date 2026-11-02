// The cron trigger (every 5 minutes) sends each device its morning and night reminder at the
// times set in the app, in that device's time zone (PLAN.md 11.5, D22, D32).
import type { Env } from './http'
import { sendPush } from './push'

export interface ReminderTimes {
  morning: string
  night: string
}

/** The app's starting times (D22). The server only has them once they're changed in Setup. */
export const DEFAULT_TIMES: ReminderTimes = { morning: '12:00', night: '00:00' }

/** A late or skipped run still sends, up to this many minutes after the time. */
export const WINDOW_MINUTES = 30

export async function reminderTimes(env: Env): Promise<ReminderTimes> {
  const data = await env.DB.prepare("SELECT data FROM records WHERE tbl = 'settings' AND id = 'reminders'").first<string>('data')
  if (!data) return DEFAULT_TIMES
  const record = JSON.parse(data) as { value?: Partial<ReminderTimes>; deleted?: boolean }
  return record.deleted ? DEFAULT_TIMES : { ...DEFAULT_TIMES, ...record.value }
}

function minutesOf(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null
}

export interface LocalClock {
  /** YYYY-MM-DD */
  date: string
  /** Minutes since midnight. */
  minutes: number
}

/** The date and time of day at `now` in a time zone. */
export function localClock(now: Date, timeZone: string): LocalClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

function dayBefore(date: string): string {
  const day = new Date(`${date}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() - 1)
  return day.toISOString().slice(0, 10)
}

/** The reminders due at a moment, with the day each one is for. */
export function dueReminders(times: ReminderTimes, clock: LocalClock): { kind: keyof ReminderTimes; day: string }[] {
  const due: { kind: keyof ReminderTimes; day: string }[] = []
  for (const kind of ['morning', 'night'] as const) {
    const at = minutesOf(times[kind])
    if (at === null) continue
    const late = (clock.minutes - at + 24 * 60) % (24 * 60)
    if (late >= WINDOW_MINUTES) continue
    // Just after midnight, a reminder set for before midnight belongs to the day before.
    due.push({ kind, day: late > clock.minutes ? dayBefore(clock.date) : clock.date })
  }
  return due
}

/** Sends the reminders that are due. Returns how many went out. */
export async function runReminders(env: Env, now: Date): Promise<number> {
  const times = await reminderTimes(env)
  const { results } = await env.DB.prepare('SELECT endpoint, timezone FROM subscriptions').all<{ endpoint: string; timezone: string }>()
  let sent = 0
  for (const { endpoint, timezone } of results) {
    let clock: LocalClock
    try {
      clock = localClock(now, timezone)
    } catch {
      continue
    }
    for (const { kind, day } of dueReminders(times, clock)) {
      // Note it as sent first, so two runs can't both send it.
      const claimed = await env.DB.prepare('INSERT OR IGNORE INTO sent (endpoint, kind, day) VALUES (?1, ?2, ?3)').bind(endpoint, kind, day).run()
      if (!claimed.meta.changes) continue
      const result = await sendPush(env, endpoint, now)
      if (result === 'sent') sent++
      else if (result === 'gone') await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?1').bind(endpoint).run()
      // Try again on the next run, while it's still in the window.
      else await env.DB.prepare('DELETE FROM sent WHERE endpoint = ?1 AND kind = ?2 AND day = ?3').bind(endpoint, kind, day).run()
    }
  }
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  await env.DB.prepare('DELETE FROM sent WHERE day < ?1').bind(weekAgo).run()
  return sent
}
