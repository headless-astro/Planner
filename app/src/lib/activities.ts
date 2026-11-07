// The week's activities (F70): each day holds tracks you picked and things in your own words,
// each in a part of the day with a short note. Plain functions, so they're easy to test.
//
// Days from before had fixed slots (a morning block, a Spanish practice) and tracks had their
// own days. Until such a day is changed on the Week screen, its activities are worked out from
// those, so nothing moves.
import type { Track } from './db'
import type { Activity, DayTemplate, SpanishKind } from './setup'

/** Tech study, Spanish and drawing became tracks with these ids (D83, D84). */
export const TECH_TRACK = 'track-tech'
export const SPANISH_TRACK = 'track-spanish'
export const DRAWING_TRACK = 'track-drawing'

const SPANISH_DAILY: Record<SpanishKind, Pick<Activity, 'id' | 'note' | 'log'>> = {
  video: { id: 'spanish-video', note: '1 video', log: 'minutes' },
  exercise: { id: 'spanish-exercise', note: 'Revise or exercises', log: 'done' },
  reading: { id: 'spanish-reading', note: 'Reading', log: 'pages' },
}

/** The activity id the old Spanish practice of a kind became. */
export const spanishActivityId = (kind: SpanishKind) => SPANISH_DAILY[kind].id

/** A day's activities: the saved ones, or for a day from before, what its slots were. */
export function dayActivities(day: DayTemplate, weekday: number, tracks: readonly Pick<Track, 'id' | 'weekdays'>[]): Activity[] {
  if (day.activities) return day.activities
  const activities: Activity[] = []
  switch (day.morning) {
    case 'tech':
      activities.push({ id: 'tech', part: 'morning', trackId: TECH_TRACK, log: 'step' })
      break
    case 'spanish-book':
      activities.push({ id: 'spanish-book', part: 'morning', trackId: SPANISH_TRACK, note: 'Book', log: 'step' })
      break
    case 'drawing':
      activities.push({ id: 'drawing', part: 'morning', trackId: DRAWING_TRACK, log: 'done' })
      break
    case 'custom':
      if (day.morningText?.trim()) activities.push({ id: 'custom', part: 'morning', text: day.morningText.trim(), log: 'done' })
      break
  }
  if (day.spanish) activities.push({ ...SPANISH_DAILY[day.spanish], part: 'anytime', trackId: SPANISH_TRACK })
  for (const track of tracks) {
    if (track.id === TECH_TRACK || track.id === SPANISH_TRACK || track.id === DRAWING_TRACK) continue
    if (track.weekdays?.includes(weekday)) activities.push({ id: `track-${track.id}`, part: 'anytime', trackId: track.id, log: 'done' })
  }
  return activities
}

/** Whether the weekly review is on this day. */
export const isReviewDay = (day: DayTemplate) => day.review ?? day.morning === 'review'

/** "Guitar, 20 min" → "guitar-20-min": what your own activity's ticks and count are kept under. */
export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{Mark}/gu, '')
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'activity'
  )
}

/** The tick a custom activity is kept under on a day: "act:guitar-20-min". */
export const customKey = (text: string) => `act:${slug(text)}`

/** Something on the week that's counted: a track, or an activity in your own words. */
export interface Scheduled {
  key: string
  label: string
  trackId: string | null
  /** The weekdays it's on, Monday = 0. */
  weekdays: number[]
}

/** Everything the week holds, each with the days it's on, in the order they first appear. */
export function scheduledThings(week: readonly DayTemplate[], tracks: readonly Pick<Track, 'id' | 'name' | 'weekdays'>[]): Scheduled[] {
  const things = new Map<string, Scheduled>()
  week.forEach((day, weekday) => {
    for (const activity of dayActivities(day, weekday, tracks)) {
      const track = activity.trackId ? tracks.find((candidate) => candidate.id === activity.trackId) : undefined
      if (activity.trackId && !track) continue
      const key = track ? `track:${track.id}` : customKey(activity.text ?? '')
      const label = track ? track.name : (activity.text ?? '')
      const thing = things.get(key) ?? { key, label, trackId: track?.id ?? null, weekdays: [] }
      if (!thing.weekdays.includes(weekday)) thing.weekdays.push(weekday)
      things.set(key, thing)
    }
  })
  return [...things.values()]
}

/** A new id for an activity. */
export const activityId = () => `a${Math.random().toString(36).slice(2, 10)}`
