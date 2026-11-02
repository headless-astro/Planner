// Tech study: 37 topics in blocks A–F, two sessions a week (PLAN.md 7.4, D36).
import { addDays, parseDate, toISODate } from './dates'
import { db, type Topic } from './db'
import { setEntry } from './repo'
import { STUDY_SESSIONS_PER_WEEK } from './setup'
import { alive, update } from './store'

export async function listTopics(): Promise<Topic[]> {
  return alive(await db.topics.toArray()).sort((a, b) => a.number - b.number)
}

export const updateTopic = (id: string, changes: Partial<Pick<Topic, 'startNote' | 'endNote' | 'needsRevision'>>) =>
  update(db.topics, id, changes)

/** The topic for a day's session: the one done that day, or else the next one not done yet. */
export function topicForDay(topics: readonly Topic[], date: string): Topic | null {
  return topics.find((topic) => topic.doneDate === date) ?? topics.find((topic) => !topic.doneDate) ?? null
}

/** Marks a topic done on a date, or not done; the Study tick for that day follows (F5). */
export async function setTopicDone(topicId: string, date: string, done: boolean): Promise<void> {
  const topic = await db.topics.get(topicId)
  if (!topic) return
  await update(db.topics, topicId, { doneDate: done ? date : null })
  if (done) await setEntry(date, 'tick:study', true)
  else if (topic.doneDate) await setEntry(topic.doneDate, 'tick:study', false)
}

export interface StudyProgress {
  done: number
  total: number
  /** Weeks left at two sessions a week. */
  weeksLeft: number
  /** Roughly when the last topic gets done at that pace. */
  finish: string | null
}

export function studyProgress(topics: readonly Topic[], today: string): StudyProgress {
  const left = topics.filter((topic) => !topic.doneDate).length
  const weeksLeft = Math.ceil(left / STUDY_SESSIONS_PER_WEEK)
  return {
    done: topics.length - left,
    total: topics.length,
    weeksLeft,
    finish: left ? toISODate(addDays(parseDate(today), weeksLeft * 7)) : null,
  }
}
