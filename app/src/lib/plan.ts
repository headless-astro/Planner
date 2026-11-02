// Builds the plan for a day from the setup. Plain functions, so they're easy to test.
import { WEEKDAYS, addDays, daysBetween, formatDate, parseDate, weekSince, weekStart, weekdayIndex } from './dates'
import {
  CARDIO,
  DEFAULT_DOSES,
  DEFAULT_DRAWING_AREAS,
  DEFAULT_TOPICS,
  DEFAULT_TRACKS,
  LONG_CARDIO,
  PRIMER_START,
  PRIMER_WEEKS,
  SPANISH_BOOK_FLOOR,
  SPANISH_FLOORS,
  STRENGTH_MOVES,
  STRENGTH_ROUNDS,
  TECH_FLOOR,
  WARM_UP,
  WEEK_TEMPLATE,
  YOGA_TIPS,
  type DayTemplate,
  type MorningBlock,
  type SpanishKind,
  type TimeOfDay,
} from './setup'

/** A med dose as the plan needs it; the full records live in the database. */
export interface DoseLike {
  id: string
  label: string
  time: TimeOfDay
}

/** A practice track as the plan needs it. */
export interface TrackLike {
  id: string
  name: string
  start: string
  weeks: number
  /** Monday = 0 … Sunday = 6. */
  weekdays: readonly number[]
  focus: readonly string[]
}

/** The setup a day is built from; anything left out uses the starting setup. */
export interface DaySetup {
  /** The week's rhythm, Monday first (F30). */
  week?: readonly DayTemplate[]
  doses?: readonly DoseLike[]
  tracks?: readonly TrackLike[]
  /** The tech study topic for the day; null once every topic is done. */
  studyTopic?: { number: number; title: string } | null
  /** What the day's Spanish book session is, e.g. "unit 3". */
  bookSession?: string
  /** The drawing area for the day's session; null when there are no areas. */
  drawingArea?: { name: string; exercises: readonly string[] } | null
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
  /** For the Spanish floor: which kind of practice it is. */
  practice?: SpanishKind
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

function morningBlock(template: DayTemplate, date: Date, setup: DaySetup): PlanItem | null {
  switch (template.morning) {
    case 'tech': {
      const topic = setup.studyTopic === undefined ? DEFAULT_TOPICS[0] : setup.studyTopic
      if (!topic) return { id: 'study', label: 'Tech study → every topic is done', detail: '30 min · go over the topics flagged for revision', link: { href: '#/study', text: 'Open tech study' } }
      return {
        id: 'study',
        label: `Tech study → #${topic.number} ${topic.title}`,
        detail: `30 min · floor: ${TECH_FLOOR}`,
        link: { href: `#/study/${topic.number}`, text: 'Open notes' },
      }
    }
    case 'spanish-book':
      return {
        id: 'spanish-book',
        label: `Spanish book → ${setup.bookSession ?? 'review session 1 of 2'}`,
        detail: `30 min · floor: ${SPANISH_BOOK_FLOOR}`,
      }
    case 'drawing': {
      // Until the areas have loaded, the plan shows the first starting area.
      const area = setup.drawingArea === undefined ? DEFAULT_DRAWING_AREAS[0] : setup.drawingArea
      const link = { href: '#/drawing', text: 'Open the drawing plan' }
      if (!area) return { id: 'drawing-study', label: 'Drawing study', detail: '30 min', link }
      return {
        id: 'drawing-study',
        label: `Drawing → ${area.name}`,
        detail: '30 min · this week’s area',
        steps: area.exercises.length ? [...area.exercises] : undefined,
        stepsLabel: 'Show exercises',
        link,
      }
    }
    case 'review':
      return { id: 'review', label: 'Weekly review', detail: '10 min', link: { href: '#/review', text: 'Open the review' } }
    case 'free':
      return null
  }
}

function workout(template: DayTemplate, date: Date): PlanItem | null {
  if (template.workout === 'rest') return null
  const week = weekSince(parseDate(PRIMER_START), date)
  if (week < 1) return null
  if (week > PRIMER_WEEKS) {
    return { id: 'workout', label: 'Workout', detail: 'Primer 2 is finished; the next block isn’t set yet' }
  }
  const i = week - 1
  const program = `Primer 2 · week ${week}`
  switch (template.workout) {
    case 'strength':
      return {
        id: 'workout',
        label: `Workout → strength, ${STRENGTH_ROUNDS[i]} rounds`,
        detail: program,
        steps: [WARM_UP, ...STRENGTH_MOVES.map((move) => `${move.name}: ${move.reps[i]}`), 'Rest 60–90 s between rounds'],
      }
    case 'cardio':
      return { id: 'workout', label: `Workout → cardio, ${CARDIO[i]}`, detail: `${program} · walk outside or elliptical`, steps: [WARM_UP] }
    case 'long-cardio':
      return { id: 'workout', label: `Workout → longer cardio, ${LONG_CARDIO[i]}`, detail: `${program} · or badminton`, steps: [WARM_UP] }
    case 'yoga':
      return { id: 'workout', label: 'Workout → yoga or pilates, 30 min', detail: `${program} · wrist-friendly`, steps: YOGA_TIPS }
  }
}

/** Where a track is on a date: its week, if the date is one of its practice days. */
export function trackDay(track: TrackLike, date: Date): { week: number; focus: string | null } | null {
  const days = daysBetween(parseDate(track.start), date)
  if (days < 0) return null
  const week = Math.floor(days / 7) + 1
  if (week > track.weeks || !track.weekdays.includes(weekdayIndex(date))) return null
  return { week, focus: track.focus[week - 1] ?? null }
}

/** Item ids for practice tracks are "track:<track id>". */
export const TRACK_ITEM_PREFIX = 'track:'

function trackItems(tracks: readonly TrackLike[], date: Date): PlanItem[] {
  return tracks.flatMap((track) => {
    const day = trackDay(track, date)
    if (!day) return []
    return [
      {
        id: `${TRACK_ITEM_PREFIX}${track.id}`,
        label: `${track.name} · week ${day.week} of ${track.weeks}`,
        detail: day.focus ? `Focus: ${day.focus}` : undefined,
      },
    ]
  })
}

export function buildDay(date: Date, setup: DaySetup = {}): DayPlan {
  const doses = setup.doses ?? DEFAULT_DOSES
  const tracks = setup.tracks ?? DEFAULT_TRACKS
  const weekday = weekdayIndex(date)
  const template = (setup.week ?? WEEK_TEMPLATE)[weekday] ?? WEEK_TEMPLATE[weekday]
  const morning: PlanItem[] = []
  const anytime: PlanItem[] = []
  const evening: PlanItem[] = []

  if (template.weighIn) morning.push({ id: 'weigh-in', label: 'Weigh-in', detail: 'after waking, before eating' })

  for (const dose of doses) {
    const item = { id: dose.id, label: dose.label }
    if (dose.time === 'morning') morning.push(item)
    else if (dose.time === 'anytime') anytime.push(item)
    else evening.push(item)
  }

  const block = morningBlock(template, date, setup)
  if (block) morning.push(block)
  const session = workout(template, date)
  if (session) morning.push(session)

  anytime.push({ id: 'skin', label: 'Skin routine' })
  if (template.spanish) {
    const input = template.spanish === 'video' ? 'minutes' : template.spanish === 'reading' ? 'pages' : undefined
    anytime.push({ id: 'spanish', label: SPANISH_FLOORS[template.spanish], input, practice: template.spanish })
  }
  anytime.push(...trackItems(tracks, date))

  return {
    date,
    weekday: WEEKDAYS[weekday],
    dateText: formatDate(date),
    morning,
    anytime,
    evening,
    foodRules: template.foodRules,
  }
}

/** The weekdays (Monday = 0) whose morning slot is a given block. */
export const daysWith = (week: readonly DayTemplate[], block: MorningBlock) =>
  week.flatMap((day, index) => (day.morning === block ? [index] : []))

/** Monday to Sunday of the week a date is in. */
export function weekDates(date: Date): Date[] {
  const monday = weekStart(date)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}
