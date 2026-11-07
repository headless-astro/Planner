// Upcoming (F47): the next 14 days in one place (D81). Routines when they're next due, list tasks by
// their deadline, to-dos on their day, and tracks that run for some weeks (D87). What repeats
// every week (meds, workouts, ongoing tracks, your own activities) is left out.
import { dayActivities } from './activities'
import { formatShort, parseDate, weekdayIndex } from './dates'
import { db, type Task, type TaskList, type Topic, type Track, type TrackSession } from './db'
import { getWeek } from './repo'
import { dueText, getRoutineStatuses, type RoutineStatus } from './routines'
import type { DayTemplate } from './setup'
import { comingDays, dayLabel } from './summary'
import { listAllTasks, listLists } from './tasks'
import { focusFor, isRunning, listSessions, listTracks, trackEnd, trackStatus } from './tracks'
import { alive } from './store'

export type UpcomingKind = 'plan' | 'routine' | 'task' | 'to-do'

export interface UpcomingItem {
  id: string
  kind: UpcomingKind
  title: string
  detail: string
  href: string
}

export interface UpcomingDay {
  date: string
  /** "Today", "Tomorrow" or the weekday. */
  label: string
  items: UpcomingItem[]
}

export interface Upcoming {
  /** Routines and list tasks that are already late, listed once. */
  late: UpcomingItem[]
  days: UpcomingDay[]
}

export interface UpcomingInput {
  today: string
  week: readonly DayTemplate[]
  routines: readonly RoutineStatus[]
  tasks: readonly Task[]
  lists: readonly Pick<TaskList, 'id' | 'name'>[]
  tracks: readonly Track[]
  /** Every track's steps, so the next step can be named. */
  steps?: readonly Topic[]
  /** Sessions, for a looping focus. */
  sessions?: readonly TrackSession[]
  /** How many days, from `today` on. */
  days?: number
}

const ORDER: Record<UpcomingKind, number> = { plan: 0, routine: 1, task: 2, 'to-do': 3 }

/** Upcoming looks two weeks ahead (D81). */
export const UPCOMING_DAYS = 14

export function buildUpcoming(input: UpcomingInput): Upcoming {
  const { today } = input
  const dates = comingDays(today, input.days ?? UPCOMING_DAYS)
  const last = dates[dates.length - 1]
  const byDate = new Map<string, UpcomingItem[]>(dates.map((date) => [date, []]))
  const late: UpcomingItem[] = []
  const add = (date: string, item: UpcomingItem) => byDate.get(date)?.push(item)

  // Tracks with an end (D87): their sessions from the week, the day they start and their last
  // day. What's the same every week (ongoing tracks, your own activities, the review) isn't
  // listed: the week already says it.
  const described = new Set<string>()
  for (const track of input.tracks) {
    const label = (date: string, note?: string) => {
      const status = trackStatus(track, date)
      const key = track.id
      const extra: string[] = [note ?? '']
      if (!described.has(key)) {
        described.add(key)
        const focus = focusFor(track, (input.sessions ?? []).filter((session) => session.trackId === track.id), date)
        extra.push(focus ? `Focus: ${focus.name}` : '')
      }
      if (date === track.start) extra.unshift('starts')
      else if (!track.ongoing && date === trackEnd(track)) extra.unshift('last day')
      else if (!track.ongoing && status.week) extra.push(`week ${status.week} of ${track.weeks}`)
      return extra.filter(Boolean).join(' · ')
    }
    for (const date of dates) {
      const weekday = weekdayIndex(parseDate(date))
      const day = input.week[weekday]
      const sessions = !track.ongoing && day && isRunning(track, date) ? dayActivities(day, weekday, input.tracks).filter((activity) => activity.trackId === track.id) : []
      for (const activity of sessions) {
        add(date, { id: `plan:${activity.id}:${date}`, kind: 'plan', title: track.name, detail: label(date, activity.note?.trim()), href: `#/track/${track.id}` })
      }
      // A start or an end on a day without a session still shows.
      const marks = date === track.start || (!track.ongoing && date === trackEnd(track))
      if (marks && !sessions.length) add(date, { id: `plan:${track.id}:mark:${date}`, kind: 'plan', title: track.name, detail: label(date), href: `#/track/${track.id}` })
    }
  }

  // Routines, on the day they're next due. Ones never done have no date yet.
  for (const status of input.routines) {
    if (!status.nextDue || status.doneThatDay) continue
    const item = { id: `routine:${status.routine.id}`, kind: 'routine' as const, title: status.routine.name, href: '#/routines' }
    if (status.nextDue < today) late.push({ ...item, detail: `routine · ${dueText(status)}` })
    else if (status.nextDue <= last) add(status.nextDue, { ...item, detail: `routine · ${status.routine.area}` })
  }

  // List tasks by their deadline, and to-dos on their day (unfinished ones carry over to today, D21).
  const listNames = new Map(input.lists.map((list) => [list.id, list.name]))
  for (const task of input.tasks) {
    if (task.done) continue
    if (task.listId !== null) {
      if (!task.due || !listNames.has(task.listId)) continue
      const item = { id: `task:${task.id}`, kind: 'task' as const, title: task.title, href: '#/lists' }
      const list = listNames.get(task.listId)
      if (task.due < today) late.push({ ...item, detail: `${list} · late since ${formatShort(parseDate(task.due))}` })
      else if (task.due <= last) add(task.due, { ...item, detail: `${list}${task.due === today ? ' · due today' : ''}` })
    } else if (task.parentId === null && task.date) {
      const date = task.date < today ? today : task.date
      if (date <= last) add(date, { id: `todo:${task.id}`, kind: 'to-do', title: task.title, detail: 'to-do', href: '#/today' })
    }
  }

  late.sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
  return {
    late,
    days: dates.map((date) => ({
      date,
      label: dayLabel(date, today),
      items: (byDate.get(date) ?? []).sort((a, b) => ORDER[a.kind] - ORDER[b.kind]),
    })),
  }
}

/**
 * Loads everything Upcoming needs and builds the days from `start` (today by default). Routines
 * are placed by where they stand today; the weekly review uses it for next week.
 */
export async function getUpcoming(today: string, start: string = today, days = UPCOMING_DAYS): Promise<Upcoming> {
  const [week, routines, tasks, lists, tracks, steps, sessions] = await Promise.all([
    getWeek(),
    getRoutineStatuses(today),
    listAllTasks(),
    listLists(),
    listTracks(),
    db.topics.toArray().then(alive),
    listSessions(),
  ])
  return buildUpcoming({ today: start, days, week, routines, tasks, lists, tracks, steps, sessions })
}
