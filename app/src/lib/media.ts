// Books, games, movies and shows (PLAN.md S18, F16). They stay off Today; finishing a book or
// a movie or show ticks Read or Movie/Show for the day (F5).
import { db, type MediaItem, type MediaKind } from './db'
import { setEntry } from './repo'
import { alive, newId, now, softDelete, update } from './store'

export interface MediaKindInfo {
  /** The screen: #/books, #/games or #/shows. */
  screen: 'books' | 'games' | 'shows'
  title: string
  /** The sub-tab with what you're on now and what you finished. */
  log: string
  /** "book", as in "Add a book". */
  one: string
  active: string
  want: string
  /** The "Also today" tick that finishing one counts for. */
  tick: string | null
}

export const MEDIA_KINDS: Record<MediaKind, MediaKindInfo> = {
  book: { screen: 'books', title: 'Books', log: 'Reading', one: 'book', active: 'Reading now', want: 'Want to read', tick: 'read' },
  game: { screen: 'games', title: 'Games', log: 'Playing', one: 'game', active: 'Playing now', want: 'Want to play', tick: null },
  watch: { screen: 'shows', title: 'Movies & shows', log: 'Watching', one: 'movie or show', active: 'Watching now', want: 'Want to watch', tick: 'movie' },
}

export async function listMedia(kind: MediaKind): Promise<MediaItem[]> {
  return alive(await db.media.where('kind').equals(kind).toArray())
}

async function tickFinished(kind: MediaKind, date: string): Promise<void> {
  const tick = MEDIA_KINDS[kind].tick
  if (tick) await setEntry(date, `tick:${tick}`, true)
}

export interface NewMediaFields {
  author?: string
  format?: 'movie' | 'show'
  /** When you started; `date` when left out. */
  started?: string
  /** When you finished, for a finished one; `date` when left out. */
  finished?: string
  rating?: number | null
}

/**
 * Adds a title you're on now, want to get to, or finished. Dates can be in the past, for
 * filling in what you did before: finishing still ticks Read or Movie/Show on the day it was
 * finished.
 */
export async function addMedia(
  kind: MediaKind,
  title: string,
  status: 'active' | 'want' | 'done',
  date: string,
  fields: NewMediaFields = {},
): Promise<void> {
  const finished = status === 'done' ? (fields.finished ?? date) : null
  // A start after the finish can only be a slip; the finish day is used instead.
  const startedOn = fields.started ?? (status === 'done' ? (fields.finished ?? date) : date)
  const started = status === 'want' ? null : finished && startedOn > finished ? finished : startedOn
  await db.media.put({
    id: newId(),
    kind,
    title,
    author: kind === 'book' ? (fields.author ?? '') : '',
    format: kind === 'watch' ? (fields.format ?? 'movie') : null,
    genre: '',
    status,
    started,
    finished,
    rating: status === 'done' ? (fields.rating ?? null) : null,
    notes: '',
    updatedAt: now(),
  })
  if (finished) await tickFinished(kind, finished)
}

export const startMedia = (id: string, date: string) => update(db.media, id, { status: 'active', started: date })

/** Marks a title finished on a date, which ticks Read or Movie/Show for that day. */
export async function finishMedia(id: string, date: string): Promise<void> {
  const item = await db.media.get(id)
  if (!item || item.deleted) return
  await update(db.media, id, { status: 'done', started: item.started ?? date, finished: date })
  await tickFinished(item.kind, date)
}

export type MediaChanges = Partial<Omit<MediaItem, 'id' | 'updatedAt' | 'deleted' | 'kind'>>

export const updateMedia = (id: string, changes: MediaChanges) => update(db.media, id, changes)
export const deleteMedia = (id: string) => softDelete(db.media, id)

export interface MediaGroups {
  /** Started most recently first. */
  active: MediaItem[]
  /** By title. */
  want: MediaItem[]
  /** Finished or stopped, most recent first. */
  finished: MediaItem[]
}

export function groupMedia(items: readonly MediaItem[]): MediaGroups {
  const latest = (date: (item: MediaItem) => string | null) => (a: MediaItem, b: MediaItem) =>
    (date(b) ?? '').localeCompare(date(a) ?? '') || b.updatedAt - a.updatedAt
  return {
    active: items.filter((item) => item.status === 'active').sort(latest((item) => item.started)),
    want: items.filter((item) => item.status === 'want').sort((a, b) => a.title.localeCompare(b.title)),
    finished: items
      .filter((item) => item.status === 'done' || item.status === 'stopped')
      .sort(latest((item) => item.finished ?? item.started)),
  }
}

/** How many were finished in a year, e.g. "2026". */
export const finishedIn = (items: readonly MediaItem[], year: string) =>
  items.filter((item) => item.status === 'done' && item.finished?.startsWith(year)).length
