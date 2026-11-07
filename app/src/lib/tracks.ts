// Tracks (F27, F69): anything you work at. A track can run for some weeks or keep going, have
// steps in order, add up time toward milestones, and have a weekly focus that runs once or
// loops. The week decides which days it's on (F70); sessions are what you did.
import { TECH_TRACK } from './activities'
import { addDays, daysBetween, formatShort, parseDate, toISODate, weekStart } from './dates'
import { db, type Topic, type Track, type TrackSession } from './db'
import { setEntry } from './repo'
import { alive, listOrdered, newId, nextOrder, now, softDelete, update } from './store'

export const listTracks = () => listOrdered(db.tracks)

/** A session's id: the track, the day, and the week's activity it was for. */
export const sessionId = (trackId: string, date: string, activityId?: string) => (activityId ? `${trackId}|${date}|${activityId}` : `${trackId}|${date}`)

/** All sessions, newest first. */
export async function listSessions(): Promise<TrackSession[]> {
  return alive(await db.trackSessions.toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)
}

/** The session for an activity on a day. Older sessions without an activity count for any. */
export function sessionFor(sessions: readonly TrackSession[], trackId: string, date: string, activityId?: string): TrackSession | undefined {
  return sessions.find(
    (session) => session.trackId === trackId && session.date === date && (session.activityId === activityId || !session.activityId || !activityId),
  )
}

export type SessionDetails = Partial<Pick<TrackSession, 'minutes' | 'pages' | 'practiced' | 'feeling' | 'stepId' | 'focus'>>

/** Logs a session, or changes its details. A track that also counts for a habit ticks it (F5). */
export async function saveSession(trackId: string, date: string, details: SessionDetails, activityId?: string): Promise<void> {
  const id = sessionId(trackId, date, activityId)
  const existing = await db.trackSessions.get(id)
  await db.trackSessions.put({
    minutes: null,
    practiced: '',
    feeling: '',
    ...existing,
    ...details,
    id,
    trackId,
    date,
    ...(activityId ? { activityId } : {}),
    deleted: false,
    updatedAt: now(),
  })
  const track = await db.tracks.get(trackId)
  if (track?.habitId && !existing) await setEntry(date, `tick:${track.habitId}`, true)
}

/** Logs a session on a date, or removes it. */
export async function setSession(trackId: string, date: string, done: boolean, activityId?: string): Promise<void> {
  if (!done) return softDelete(db.trackSessions, sessionId(trackId, date, activityId))
  await saveSession(trackId, date, {}, activityId)
}

/** Logs another session from the track's page: a day can hold more than one. */
export async function addSession(trackId: string, date: string, details: SessionDetails): Promise<void> {
  await saveSession(trackId, date, details, `log-${newId().slice(0, 8)}`)
}

export const deleteSession = (id: string) => softDelete(db.trackSessions, id)

// ── The track itself ──

export interface NewTrack {
  name: string
  start: string
  weeks: number
  ongoing?: boolean
  focus?: string[]
  loop?: boolean
  steps?: boolean
  milestones?: { name: string; hours: number }[] | null
}

/** Adds a track and returns its id. Its days are set on the Week screen. */
export async function addTrack(fields: NewTrack): Promise<string> {
  const id = newId()
  await db.tracks.put({ focus: [], ...fields, id, weekdays: [], order: await nextOrder(db.tracks), updatedAt: now() })
  return id
}

export type TrackChanges = Partial<Omit<Track, 'id' | 'updatedAt' | 'deleted' | 'order'>>
// A plain copy: lists edited on screen can arrive wrapped, and the database only stores plain data.
export const updateTrack = (id: string, changes: TrackChanges) => update(db.tracks, id, JSON.parse(JSON.stringify(changes)) as TrackChanges)
export const deleteTrack = (id: string) => softDelete(db.tracks, id)

/** The last day of a track that runs for some weeks. */
export function trackEnd(track: Pick<Track, 'start' | 'weeks'>): string {
  return toISODate(addDays(parseDate(track.start), track.weeks * 7 - 1))
}

/** Whether a track is on at a date: started, and not past its last week. */
export function isRunning(track: Pick<Track, 'start' | 'weeks' | 'ongoing'>, date: string): boolean {
  return date >= track.start && (!!track.ongoing || date <= trackEnd(track))
}

export interface TrackStatus {
  state: 'upcoming' | 'running' | 'finished'
  /** "Starts Sat 7 Nov", "Week 2 of 4", "Week 9" or "Finished". */
  text: string
  /** 1-based, while it runs. */
  week: number | null
}

export function trackStatus(track: Pick<Track, 'start' | 'weeks' | 'ongoing'>, date: string): TrackStatus {
  if (date < track.start) return { state: 'upcoming', text: `Starts ${formatShort(parseDate(track.start))}`, week: null }
  const week = Math.floor(daysBetween(parseDate(track.start), parseDate(date)) / 7) + 1
  if (track.ongoing) return { state: 'running', text: `Week ${week}`, week }
  if (date > trackEnd(track)) return { state: 'finished', text: 'Finished', week: null }
  return { state: 'running', text: `Week ${week} of ${track.weeks}`, week }
}

// ── The weekly focus ──

export interface Focus {
  index: number
  name: string
  notes: string
}

/**
 * The focus for a date. A fixed list goes week by week from the start. A loop keeps one focus a
 * week: the one a session that day was for, or else the one after the last you did before that
 * week, so a missed week never skips one (rule 4).
 */
export function focusFor(track: Pick<Track, 'start' | 'focus' | 'loop' | 'focusNotes'>, sessions: readonly TrackSession[], date: string): Focus | null {
  const list = track.focus.filter((line) => line.trim())
  if (!list.length) return null
  const at = (index: number): Focus => ({ index, name: list[index], notes: track.focusNotes?.[index] ?? '' })
  if (!track.loop) {
    const index = Math.floor(daysBetween(parseDate(track.start), parseDate(date)) / 7)
    return index >= 0 && index < list.length ? at(index) : null
  }
  const logged = sessions.find((session) => session.date === date && session.focus && list.includes(session.focus))
  if (logged?.focus) return at(list.indexOf(logged.focus))
  const monday = toISODate(weekStart(parseDate(date)))
  const before = sessions.filter((session) => session.date < monday && session.focus).sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!before?.focus) return at(0)
  // A focus that was renamed or removed since starts the loop over.
  return at((list.indexOf(before.focus) + 1) % list.length)
}

// ── Steps ──

/** A track's steps in order. Tech study's topics from before have no track, and are its steps. */
export function stepsOf(trackId: string, topics: readonly Topic[]): Topic[] {
  return topics.filter((topic) => (topic.trackId ?? TECH_TRACK) === trackId).sort((a, b) => a.number - b.number)
}

/** Every track's steps. */
export const listAllSteps = async () => alive(await db.topics.toArray())

export async function listSteps(trackId: string): Promise<Topic[]> {
  return stepsOf(trackId, alive(await db.topics.toArray()))
}

/** The step for a day's session: the one done that day, or else the next one not done yet. */
export function stepForDay(steps: readonly Topic[], date: string): Topic | null {
  return steps.find((step) => step.doneDate === date) ?? steps.find((step) => !step.doneDate) ?? null
}

export async function addStep(trackId: string, title: string, block = ''): Promise<void> {
  const steps = await listSteps(trackId)
  await db.topics.put({
    id: newId(),
    trackId,
    number: (steps.at(-1)?.number ?? 0) + 1,
    block,
    title,
    subtopics: '',
    startNote: '',
    endNote: '',
    needsRevision: false,
    doneDate: null,
    updatedAt: now(),
  })
}

export const updateStep = (id: string, changes: Partial<Pick<Topic, 'title' | 'block' | 'subtopics' | 'startNote' | 'endNote' | 'needsRevision' | 'doneDate'>>) =>
  update(db.topics, id, changes)
export const deleteStep = (id: string) => softDelete(db.topics, id)

// ── Time toward a goal ──

/** Hours from the minutes logged. */
export const hoursOf = (sessions: readonly Pick<TrackSession, 'minutes'>[]) => sessions.reduce((sum, session) => sum + (session.minutes ?? 0), 0) / 60

export interface MilestoneProgress {
  hours: number
  /** The last milestone reached. */
  reached: string | null
  next: { name: string; hours: number } | null
  hoursToNext: number | null
}

/** Where the hours are against a track's milestones. */
export function milestoneProgress(hours: number, milestones: readonly { name: string; hours: number }[]): MilestoneProgress {
  const sorted = [...milestones].sort((a, b) => a.hours - b.hours)
  const reached = sorted.filter((milestone) => hours >= milestone.hours).at(-1) ?? null
  const next = sorted.find((milestone) => hours < milestone.hours) ?? null
  return { hours, reached: reached?.name ?? null, next, hoursToNext: next ? next.hours - hours : null }
}

// ── Ticking an activity on Today ──

/**
 * Ticks or unticks a track's activity on a day. One that moves through steps marks the day's
 * step done (or not); one with a weekly focus keeps which focus it was for.
 */
export async function setActivityDone(
  track: Track,
  activity: { id: string; log: string },
  date: string,
  done: boolean,
  context: { steps: readonly Topic[]; sessions: readonly TrackSession[] },
): Promise<void> {
  const step = activity.log === 'step' ? stepForDay(context.steps, date) : null
  if (!done) {
    await setSession(track.id, date, false, activity.id)
    if (step && step.doneDate === date) await updateStep(step.id, { doneDate: null })
    return
  }
  const focus = focusFor(track, context.sessions, date)
  await saveSession(track.id, date, { ...(step ? { stepId: step.id } : {}), ...(focus ? { focus: focus.name } : {}) }, activity.id)
  if (step && !step.doneDate) await updateStep(step.id, { doneDate: date })
}
