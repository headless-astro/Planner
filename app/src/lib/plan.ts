// Builds the plan for a day from the setup. Plain functions, so they're easy to test.
import { customKey, dayActivities, isReviewDay } from './activities'
import { WEEKDAYS, addDays, formatDate, weekStart, weekdayIndex, toISODate } from './dates'
import type { Topic, Track, TrackSession } from './db'
import { BLOCK_WEEKS, DEFAULT_EXERCISE, blockNow, type ExercisePlan } from './exercise'
import { ALL_FEATURES, dayWithFeatures, type Features } from './features'
import { DEFAULT_DOSES, WEEK_TEMPLATE, type Activity, type DayTemplate, type TimeOfDay } from './setup'
import { focusFor, isRunning, stepForDay, stepsOf, trackStatus } from './tracks'

/** A med dose as the plan needs it; the full records live in the database. */
export interface DoseLike {
  id: string
  label: string
  time: TimeOfDay
}

/** A track as the plan needs it. */
export type TrackLike = Pick<Track, 'id' | 'name' | 'start' | 'weeks' | 'weekdays' | 'focus' | 'ongoing' | 'loop' | 'focusNotes'>

/** The setup a day is built from; anything left out uses the starting setup. */
export interface DaySetup {
  /** The week's rhythm, Monday first (F30), with its activities (F70). */
  week?: readonly DayTemplate[]
  doses?: readonly DoseLike[]
  tracks?: readonly TrackLike[]
  /** Every track's steps (topics), for activities that move through steps. */
  steps?: readonly Topic[]
  /** Sessions, for a looping focus. */
  sessions?: readonly TrackSession[]
  /** The exercise blocks and which one is active (F59). */
  exercise?: ExercisePlan
  /** What's turned on (F63); everything by default. */
  features?: Features
}

export interface PlanItem {
  id: string
  label: string
  /** Smaller text under the label. */
  detail?: string
  /** Extra lines you can open, like a workout's exercises. */
  steps?: string[]
  /** What the link that opens the steps says. */
  stepsLabel?: string
  /** A link under the item, like a study topic's notes. */
  link?: { href: string; text: string }
  /** A number to note once the item is ticked. */
  input?: 'minutes' | 'pages'
  /** The week's activity it comes from (F70). */
  activity?: Activity
  /** For a track's activity: the track. */
  trackId?: string
  /** For an activity in your own words: what its tick is kept under. */
  tickKey?: string
}

export interface DayPlan {
  date: Date
  weekday: string
  dateText: string
  morning: PlanItem[]
  anytime: PlanItem[]
  evening: PlanItem[]
  /** False on the free day (Sunday). */
  foodRules: boolean
}

/** One of the week's activities on a day (F70): a track's session, or your own. */
function activityItem(activity: Activity, date: Date, setup: DaySetup): PlanItem | null {
  const iso = toISODate(date)
  const note = activity.note?.trim()
  const input = activity.log === 'minutes' || activity.log === 'pages' ? activity.log : undefined
  if (!activity.trackId) {
    const text = activity.text?.trim()
    if (!text) return null
    return { id: `act:${activity.id}`, label: note ? `${text} · ${note}` : text, activity, tickKey: customKey(text), input }
  }
  const track = (setup.tracks ?? []).find((candidate) => candidate.id === activity.trackId)
  if (!track || !isRunning(track, iso)) return null
  const name = note ? `${track.name} · ${note}` : track.name
  const step = activity.log === 'step' ? stepForDay(stepsOf(track.id, setup.steps ?? []), iso) : null
  const focus = focusFor(track, (setup.sessions ?? []).filter((session) => session.trackId === track.id), iso)
  const status = trackStatus(track, iso)
  const detail = [!track.ongoing && status.week ? `week ${status.week} of ${track.weeks}` : '', focus ? `Focus: ${focus.name}` : '']
    .filter(Boolean)
    .join(' · ')
  const notes = focus?.notes
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return {
    id: `act:${activity.id}`,
    label: step ? `${name} → ${step.title}` : activity.log === 'step' && setup.steps ? `${name} · every step is done` : name,
    detail: detail || undefined,
    steps: notes?.length ? notes : undefined,
    stepsLabel: notes?.length ? `About ${focus?.name}` : undefined,
    link: step ? { href: `#/step/${step.id}`, text: 'Open notes' } : { href: `#/track/${track.id}`, text: 'Open the track' },
    input,
    activity,
    trackId: track.id,
  }
}

/** The day's workout from the active exercise block (F59). Nothing before the block starts. */
function workout(template: DayTemplate, date: Date, exercise: ExercisePlan): PlanItem | null {
  if (template.workout === 'rest') return null
  const { block, week } = blockNow(exercise, date)
  if (week === null) return null
  const i = week - 1
  const program = `${block.name} · week ${week} of ${BLOCK_WEEKS}`
  switch (template.workout) {
    case 'strength':
      return {
        id: 'workout',
        label: `Workout → strength, ${block.rounds[i] ?? ''} rounds`,
        detail: program,
        steps: [block.warmUp, ...block.moves.map((move) => `${move.name}: ${move.reps[i] ?? ''}`), 'Rest 60–90 s between rounds'].filter(Boolean),
      }
    case 'cardio':
      return { id: 'workout', label: `Workout → cardio, ${block.cardio[i] ?? ''}`, detail: `${program} · walk outside or elliptical`, steps: [block.warmUp] }
    case 'long-cardio':
      return { id: 'workout', label: `Workout → longer cardio, ${block.longCardio[i] ?? ''}`, detail: `${program} · or badminton`, steps: [block.warmUp] }
    case 'yoga':
      return { id: 'workout', label: 'Workout → yoga or pilates, 30 min', detail: `${program} · wrist-friendly`, steps: block.yoga }
  }
}

export function buildDay(date: Date, setup: DaySetup = {}): DayPlan {
  const doses = setup.doses ?? DEFAULT_DOSES
  const features = setup.features ?? ALL_FEATURES
  const weekday = weekdayIndex(date)
  const template = dayWithFeatures((setup.week ?? WEEK_TEMPLATE)[weekday] ?? WEEK_TEMPLATE[weekday], features)
  const parts: Record<TimeOfDay, PlanItem[]> = { morning: [], anytime: [], evening: [] }

  if (template.weighIn) parts.morning.push({ id: 'weigh-in', label: 'Weigh-in', detail: 'after waking, before eating' })

  for (const dose of doses) parts[dose.time].push({ id: dose.id, label: dose.label })

  for (const activity of dayActivities(template, weekday, setup.tracks ?? [])) {
    const item = activityItem(activity, date, setup)
    if (item) parts[activity.part].push(item)
  }
  if (isReviewDay(template)) {
    parts.morning.push({ id: 'review', label: 'Weekly review', detail: '10 min', link: { href: '#/review', text: 'Open the review' } })
  }
  const session = workout(template, date, setup.exercise ?? DEFAULT_EXERCISE)
  if (session) parts.morning.push(session)

  return {
    date,
    weekday: WEEKDAYS[weekday],
    dateText: formatDate(date),
    morning: parts.morning,
    anytime: parts.anytime,
    evening: parts.evening,
    foodRules: template.foodRules,
  }
}

/** Monday to Sunday of the week a date is in. */
export function weekDates(date: Date): Date[] {
  const monday = weekStart(date)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}
