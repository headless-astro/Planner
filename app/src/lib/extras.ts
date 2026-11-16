// Things added to one day only (F79): a workout on a rest day, a track's session or one of your
// own activities on a day the week doesn't have it. They show on Today in the part you pick, and
// ticking one is the same tick the planned one would be, so This week, Insights, the weekly review
// and the AI export all count it. Kept as one value for the day, under the key `extras`.
import type { Track } from './db'
import { customKey, dayActivities, scheduledThings } from './activities'
import { clearEntry, setEntry } from './repo'
import type { ActivityLog, DayTemplate, TimeOfDay } from './setup'
import { isRunning } from './tracks'

export interface DayExtra {
  id: string
  part: TimeOfDay
  /** What it counts as: the workout (Fitness), a track's session, or your own activity by its words. */
  counts: 'workout' | 'track' | 'own'
  trackId?: string
  /** Your own activity's words: what it's counted under. */
  text?: string
  /** A short note, like "swimming" for a workout. */
  note?: string
  /** What a track's session or your own activity notes, as on the week. */
  log?: ActivityLog
}

export const EXTRAS_KEY = 'extras'

/** The day's extras, from its stored values. Anything malformed is left out. */
export function extrasOf(value: unknown): DayExtra[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (extra): extra is DayExtra =>
      typeof extra === 'object' && extra !== null && typeof extra.id === 'string' && ['workout', 'track', 'own'].includes(extra.counts),
  )
}

const newExtraId = () => `x${Math.random().toString(36).slice(2, 10)}`

async function saveExtras(date: string, extras: DayExtra[]): Promise<void> {
  // A plain copy: lists edited on screen can arrive wrapped, and the database only stores plain data.
  if (extras.length) await setEntry(date, EXTRAS_KEY, JSON.parse(JSON.stringify(extras)) as DayExtra[])
  else await clearEntry(date, EXTRAS_KEY)
}

export async function addExtra(date: string, current: unknown, extra: Omit<DayExtra, 'id'>): Promise<void> {
  const clean = Object.fromEntries(Object.entries(extra).filter(([, value]) => value !== undefined && value !== '')) as Omit<DayExtra, 'id'>
  await saveExtras(date, [...extrasOf(current), { ...clean, id: newExtraId() }])
}

export async function removeExtra(date: string, current: unknown, id: string): Promise<void> {
  await saveExtras(date, extrasOf(current).filter((extra) => extra.id !== id))
}

/** One thing a day's extra can count as, for the add form's "Counts as" list. */
export interface CountsAs {
  /** "workout", "track:<id>" or the own activity's key ("act:guitar"). */
  value: string
  label: string
  extra: Pick<DayExtra, 'counts' | 'trackId' | 'text' | 'log'>
}

/**
 * What can be added to a day: the workout when the day has none, each track that's running, and
 * your own activities from the week. Ones already on the day are left out.
 */
export function countsAsChoices(
  date: string,
  options: {
    week: readonly DayTemplate[]
    tracks: readonly Track[]
    exercise: boolean
    /** What the day already has: "workout", "track:<id>", "act:<slug>". */
    onDay: ReadonlySet<string>
  },
): CountsAs[] {
  const choices: CountsAs[] = []
  if (options.exercise && !options.onDay.has('workout')) choices.push({ value: 'workout', label: 'Workout (counts for Fitness)', extra: { counts: 'workout' } })
  // What it notes on the week (a step, minutes, pages), so the extra notes the same.
  const activities = options.week.flatMap((day, weekday) => dayActivities(day, weekday, options.tracks))
  const logOf = (key: string) =>
    activities.find((activity) => (activity.trackId ? `track:${activity.trackId}` : customKey(activity.text ?? '')) === key)?.log ?? 'done'
  for (const thing of scheduledThings(options.week, options.tracks)) {
    if (options.onDay.has(thing.key)) continue
    if (thing.trackId) {
      const track = options.tracks.find((candidate) => candidate.id === thing.trackId)
      if (!track || !isRunning(track, date)) continue
      choices.push({ value: thing.key, label: `${track.name} (a session)`, extra: { counts: 'track', trackId: track.id, log: logOf(thing.key) } })
    } else {
      choices.push({ value: thing.key, label: thing.label, extra: { counts: 'own', text: thing.label, log: logOf(thing.key) } })
    }
  }
  // Tracks that aren't on the week at all, but running.
  for (const track of options.tracks) {
    const key = `track:${track.id}`
    if (options.onDay.has(key) || choices.some((choice) => choice.value === key) || !isRunning(track, date)) continue
    choices.push({ value: key, label: `${track.name} (a session)`, extra: { counts: 'track', trackId: track.id, log: 'done' } })
  }
  return choices
}
