// What a day's tech study, Spanish book and drawing slots show, from saved progress. Shared by
// the Today and Week screens so both say the same thing.
import type { DrawingArea, DrawingLog, SpanishLog, Topic } from './db'
import { drawingAreaFor } from './drawing'
import type { DaySetup } from './plan'
import type { SpanishSettings } from './setup'
import { bookSessionLabel, bookState, nextBookSession } from './spanish'
import { topicForDay } from './study'

export interface TrackProgress {
  topics: readonly Topic[]
  spanishLogs: readonly SpanishLog[]
  spanishSettings: SpanishSettings
  /** Null while the areas are still loading. */
  drawingAreas: readonly DrawingArea[] | null
  drawingLogs: readonly DrawingLog[]
}

export interface TrackSetup extends Pick<DaySetup, 'studyTopic' | 'bookSession' | 'drawingArea'> {
  /** The topic the day's tech study session is about. */
  topic: Topic | null
  /** The area a drawing session that day is for. */
  drawingAreaId: string | null
}

export function trackSetup(date: string, progress: TrackProgress): TrackSetup {
  const { topics, spanishLogs, spanishSettings, drawingAreas, drawingLogs } = progress
  const topic = topicForDay(topics, date)
  const logged = spanishLogs.find((log) => log.date === date && log.kind === 'book')
  const area = drawingAreas ? drawingAreaFor(drawingAreas, drawingLogs, date) : null
  return {
    topic,
    // Until the topics have loaded, the plan shows its starting topic.
    studyTopic: topics.length ? (topic ? { number: topic.number, title: topic.title } : null) : undefined,
    bookSession: logged ? bookSessionLabel(logged) : nextBookSession(bookState(spanishLogs, spanishSettings), spanishSettings),
    drawingArea: drawingAreas ? (area ? { name: area.name, exercises: area.exercises } : null) : undefined,
    drawingAreaId: area?.id ?? null,
  }
}
