// Tech study, Spanish and drawing become tracks (D83–D85). Each device works them out from its
// own records, the way it makes the starting setup: everything gets a fixed id and updatedAt
// 0, so every device makes the same records, none of them is sent to the server, and anything
// you change afterwards syncs and wins. It only adds what's missing, so it can run on every
// start: records an older version of the app makes on another device are picked up too.
import { DRAWING_TRACK, SPANISH_TRACK, TECH_TRACK, spanishActivityId } from './activities'
import { db, type SpanishLog, type Topic, type Track, type TrackSession } from './db'
import { getSetting } from './repo'
import { DEFAULT_SPANISH, DEFAULT_TARGETS, DS_LEVELS, PRIMER_START, WEEK_TEMPLATE, type DayTemplate, type SpanishKind, type SpanishSettings, type Targets } from './setup'
import { alive } from './store'
import { weekdayIndex, parseDate } from './dates'

/** Units made as steps at first; more can be added on the track's page. */
const UNITS_AHEAD = 12

const sessionRow = (trackId: string, date: string, activityId: string, details: Partial<TrackSession>): TrackSession => ({
  id: `${trackId}|${date}|${activityId}`,
  trackId,
  date,
  activityId,
  minutes: null,
  practiced: '',
  feeling: '',
  ...details,
  updatedAt: 0,
})

/** Adds the records that aren't there yet; ones there (deleted ones too) are left alone. */
async function putMissing<T extends { id: string }>(table: { bulkGet(keys: string[]): Promise<(T | undefined)[]>; bulkPut(rows: T[]): Promise<unknown> }, rows: T[]): Promise<void> {
  if (!rows.length) return
  const existing = await table.bulkGet(rows.map((row) => row.id))
  const missing = rows.filter((_, index) => !existing[index])
  if (missing.length) await table.bulkPut(missing)
}

/**
 * `ownSetup`: the device has the original setup, so a week never changed is the starting one.
 * Anyone else's week is only what they saved.
 */
export async function migrateToTracks(ownSetup = true): Promise<void> {
  const [topics, spanishLogs, areas, drawingLogs, entries, targets, spanish, weekSetting] = await Promise.all([
    db.topics.toArray().then(alive),
    db.spanishLogs.toArray().then(alive),
    db.drawingAreas.toArray().then(alive),
    db.drawingLogs.toArray().then(alive),
    db.entries.where('key').anyOf('tick:spanish', 'tick:spanish-book').toArray().then(alive),
    getSetting<Targets>('targets', DEFAULT_TARGETS),
    getSetting<SpanishSettings>('spanish', DEFAULT_SPANISH),
    getSetting<{ days: unknown }>('week', { days: ownSetup ? WEEK_TEMPLATE : [] }),
  ])
  const week: DayTemplate[] = Array.isArray(weekSetting.days) ? (weekSetting.days as DayTemplate[]) : WEEK_TEMPLATE
  const tracks: Track[] = []
  const steps: Topic[] = []
  const sessions: TrackSession[] = []
  const firstDate = (dates: string[]) => dates.filter(Boolean).sort()[0] ?? PRIMER_START

  // ── Tech study: its topics are already the steps (they have no track, which means this one). ──
  const techTopics = topics.filter((topic) => !topic.trackId)
  if (techTopics.length) {
    tracks.push({
      id: TECH_TRACK,
      name: 'Tech study',
      start: firstDate(techTopics.map((topic) => topic.doneDate ?? '')),
      weeks: 0,
      ongoing: true,
      weekdays: [],
      focus: [],
      steps: true,
      milestones: null,
      target: targets.study ?? null,
      order: -3,
      updatedAt: 0,
    })
    for (const topic of techTopics) {
      if (topic.doneDate) sessions.push(sessionRow(TECH_TRACK, topic.doneDate, 'tech', { stepId: topic.id }))
    }
  }

  // ── Spanish: one track with the book as steps and the practice adding up hours (D85). ──
  const usesSpanish = spanishLogs.length > 0 || entries.length > 0 || week.some((day) => day?.morning === 'spanish-book' || day?.spanish)
  if (usesSpanish) {
    tracks.push({
      id: SPANISH_TRACK,
      name: 'Spanish',
      start: firstDate([...spanishLogs.map((log) => log.date), ...entries.map((entry) => entry.date)]),
      weeks: 0,
      ongoing: true,
      weekdays: [],
      focus: [],
      steps: true,
      milestones: DS_LEVELS.map((level) => ({ name: `Level ${level.level}`, hours: level.hours })),
      target: targets.spanish ?? null,
      order: -2,
      updatedAt: 0,
    })
    // The book: the review sessions, then the units.
    const book = spanishLogs.filter((log) => log.kind === 'book').sort((a, b) => a.date.localeCompare(b.date))
    const reviews = book.filter((log) => log.unit === null)
    const units = book.filter((log) => log.unit !== null)
    const lastUnit = Math.max(spanish.startUnit + UNITS_AHEAD - 1, ...units.map((log) => log.unit ?? 0))
    const step = (id: string, number: number, title: string, done: SpanishLog | undefined): Topic => ({
      id,
      trackId: SPANISH_TRACK,
      number,
      block: number <= spanish.reviewSessions ? 'Review' : 'Units',
      title,
      subtopics: '',
      startNote: '',
      endNote: done?.notes ?? '',
      needsRevision: false,
      doneDate: done?.date ?? null,
      updatedAt: 0,
    })
    for (let i = 1; i <= spanish.reviewSessions; i++) steps.push(step(`step-spanish-review-${i}`, i, `Review session ${i}`, reviews[i - 1]))
    for (let unit = spanish.startUnit; unit <= lastUnit; unit++) {
      steps.push(step(`step-spanish-unit-${unit}`, spanish.reviewSessions + 1 + unit - spanish.startUnit, `Unit ${unit}`, units.find((log) => log.unit === unit)))
    }
    for (const log of book) {
      const stepId = log.unit === null ? `step-spanish-review-${reviews.indexOf(log) + 1}` : `step-spanish-unit-${log.unit}`
      sessions.push(sessionRow(SPANISH_TRACK, log.date, 'spanish-book', { stepId, practiced: log.notes ?? '' }))
    }
    // Practice: one session per day and kind, adding up minutes and pages.
    const daily = new Map<string, TrackSession>()
    const kindOn = (date: string): SpanishKind => week[weekdayIndex(parseDate(date))]?.spanish ?? 'video'
    for (const log of spanishLogs.filter((log) => log.kind !== 'book')) {
      const kind = log.kind as SpanishKind
      const key = `${log.date}|${kind}`
      const session = daily.get(key) ?? sessionRow(SPANISH_TRACK, log.date, spanishActivityId(kind), {})
      session.minutes = log.minutes !== null || session.minutes !== null ? (session.minutes ?? 0) + (log.minutes ?? 0) : null
      session.pages = log.pages !== null || session.pages ? (session.pages ?? 0) + (log.pages ?? 0) : null
      session.practiced = [session.practiced, [log.title, log.notes].filter(Boolean).join(': ')].filter(Boolean).join(' · ')
      daily.set(key, session)
    }
    // Days ticked on Today without anything typed still count.
    for (const entry of entries.filter((entry) => entry.key === 'tick:spanish' && entry.value === true)) {
      const kind = kindOn(entry.date)
      const key = `${entry.date}|${kind}`
      if (![...daily.keys()].some((existing) => existing.startsWith(`${entry.date}|`))) daily.set(key, sessionRow(SPANISH_TRACK, entry.date, spanishActivityId(kind), {}))
    }
    sessions.push(...daily.values())
  }

  // ── Drawing: its areas loop week by week (D84), and each session also ticks Drawing. ──
  if (areas.length) {
    const ordered = [...areas].sort((a, b) => a.order - b.order)
    tracks.push({
      id: DRAWING_TRACK,
      // Apart from the Drawing habit it ticks, as Today called it before.
      name: 'Drawing study',
      start: firstDate(drawingLogs.map((log) => log.date)),
      weeks: 0,
      ongoing: true,
      weekdays: [],
      focus: ordered.map((area) => area.name),
      focusNotes: ordered.map((area) =>
        [...area.exercises.map((exercise) => `Exercise: ${exercise}`), ...area.sources.map((source) => `Source: ${source}`)].join('\n'),
      ),
      loop: true,
      steps: false,
      milestones: null,
      target: null,
      habitId: 'drawing',
      order: -1,
      updatedAt: 0,
    })
    for (const log of drawingLogs) {
      const area = areas.find((candidate) => candidate.id === log.areaId)
      sessions.push(
        sessionRow(DRAWING_TRACK, log.date, 'drawing', {
          minutes: log.minutes,
          practiced: [log.exercise, log.note].filter(Boolean).join(': '),
          ...(area ? { focus: area.name } : {}),
        }),
      )
    }
  }

  await db.transaction('rw', db.tracks, db.topics, db.trackSessions, async () => {
    await putMissing(db.tracks, tracks)
    await putMissing(db.topics, steps)
    await putMissing(db.trackSessions, sessions)
  })
}
