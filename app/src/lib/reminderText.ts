// The text of a reminder (PLAN.md 11.5, S22), written on the device from its own data: the
// morning one lists what the day holds, the night one what's left to close the day.
import { parseDate, todayISO } from './dates'
import { db } from './db'
import { buildDay, type PlanItem } from './plan'
import { getDayValues, getExercise, getFeatures, getTodos, getWeek, listDoses } from './repo'
import { getRoutineStatuses } from './routines'
import type { Reminders } from './setup'
import { alive } from './store'
import { getDueTasks } from './tasks'
import { listSessions, listTracks } from './tracks'

export type ReminderKind = 'morning' | 'night'

export interface ReminderText {
  title: string
  body: string
}

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** A ping carries no text, so the reminder is whichever of your times is nearest to now. */
export function reminderKind(times: Reminders, now: Date): ReminderKind {
  const minutes = now.getHours() * 60 + now.getMinutes()
  const distance = (time: string) => {
    const gap = Math.abs(minutes - minutesOf(time))
    return Math.min(gap, 24 * 60 - gap)
  }
  return distance(times.morning) <= distance(times.night) ? 'morning' : 'night'
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The reminder for the planner day at `now` (it runs until 06:00, D24). */
export async function reminderText(kind: ReminderKind, now = new Date()): Promise<ReminderText> {
  const date = todayISO(now)
  const [week, doses, tracks, steps, sessions, values, todos, exercise, features] = await Promise.all([
    getWeek(),
    listDoses(),
    listTracks(),
    db.topics.toArray().then(alive),
    listSessions(),
    getDayValues(date),
    getTodos(date, true),
    getExercise(),
    getFeatures(),
  ])
  const plan = buildDay(parseDate(date), { week, doses, tracks, steps, sessions, exercise, features })
  // A track's activity is done once it has a session that day; your own once it's ticked.
  const open = (item: PlanItem) => {
    if (item.trackId) return !sessions.some((session) => session.trackId === item.trackId && session.date === date)
    return values[`tick:${item.tickKey ?? item.id}`] !== true
  }
  const doseIds = new Set(doses.map((dose) => dose.id))
  const todosLeft = todos.filter((todo) => !todo.done).length

  if (kind === 'night') {
    const parts = [
      ...plan.evening.filter((item) => doseIds.has(item.id) && open(item)).map((item) => item.label),
      plan.foodRules && values.rules === undefined ? 'How did eating go?' : '',
      features.work && values.work === undefined ? 'Rate your work' : '',
      todosLeft ? `${count(todosLeft, 'to-do')} left` : '',
    ].filter(Boolean)
    return { title: 'Closing the day', body: parts.length ? parts.join(' · ') : 'All done for today. Sleep well.' }
  }

  const [routines, dueTasks] = await Promise.all([getRoutineStatuses(date), getDueTasks(date, true)])
  const meds = [...plan.morning, ...plan.anytime].filter((item) => doseIds.has(item.id) && open(item)).length
  const routinesDue = routines.filter((status) => !status.doneThatDay && status.dueIn !== null && status.dueIn <= 0).length
  const tasksDue = dueTasks.filter((due) => !due.task.done).length
  const parts = [
    meds ? `Meds ×${meds}` : '',
    // The weigh-in, the morning slot and the workout.
    ...plan.morning.filter((item) => !doseIds.has(item.id) && open(item)).map((item) => item.label),
    routinesDue ? `${count(routinesDue, 'routine')} due` : '',
    tasksDue ? `${count(tasksDue, 'task')} due` : '',
    todosLeft ? count(todosLeft, 'to-do') : '',
  ].filter(Boolean)
  return { title: 'Your day', body: parts.length ? parts.join(' · ') : 'Nothing planned. Enjoy the day.' }
}
