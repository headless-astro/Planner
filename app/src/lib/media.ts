// Books, games, movies and shows (PLAN.md S18, F16). They stay off Today; finishing a book or
// a movie or show ticks Read or Movie/Show for the day (F5).
import { db, type MediaItem, type MediaKind, type Thumb } from './db'
import { setEntry } from './repo'
import { alive, newId, now, softDelete, update } from './store'

/** The four tabs. Movies and shows are both `watch` items, told apart by `format`. */
export type Shelf = 'books' | 'games' | 'movies' | 'shows'

export interface ShelfInfo {
  kind: MediaKind
  /** Movies and shows only. */
  format: 'movie' | 'show' | null
  title: string
  /** The sub-tab with what you're on now. */
  log: string
  /** The sub-tab with what you finished (F51). */
  done: string
  /** "book", as in "Add a book". */
  one: string
  active: string
  want: string
  /** The "Also today" tick that finishing one counts for. */
  tick: string | null
  /** Movies get 1–5 stars; the rest get a thumb up, a neutral or a thumb down. */
  stars: boolean
}

export const SHELVES: Record<Shelf, ShelfInfo> = {
  books: { kind: 'book', format: null, title: 'Books', log: 'Reading', done: 'Finished', one: 'book', active: 'Reading now', want: 'Want to read', tick: 'read', stars: false },
  games: { kind: 'game', format: null, title: 'Games', log: 'Playing', done: 'Finished', one: 'game', active: 'Playing now', want: 'Want to play', tick: null, stars: false },
  movies: { kind: 'watch', format: 'movie', title: 'Movies', log: 'Watching', done: 'Watched', one: 'movie', active: 'Watching now', want: 'Want to watch', tick: 'movie', stars: true },
  shows: { kind: 'watch', format: 'show', title: 'Shows', log: 'Watching', done: 'Finished', one: 'show', active: 'Watching now', want: 'Want to watch', tick: 'movie', stars: false },
}

export function shelfOf(item: Pick<MediaItem, 'kind' | 'format'>): Shelf {
  if (item.kind === 'book') return 'books'
  if (item.kind === 'game') return 'games'
  return item.format === 'show' ? 'shows' : 'movies'
}

export async function listMedia(kind: MediaKind): Promise<MediaItem[]> {
  return alive(await db.media.where('kind').equals(kind).toArray())
}

export async function listShelf(shelf: Shelf): Promise<MediaItem[]> {
  return (await listMedia(SHELVES[shelf].kind)).filter((item) => shelfOf(item) === shelf)
}

/** The thumb for a book, game or show. Older ones rated in stars count 4–5 as up, 3 as neutral, 1–2 as down. */
export function thumbOf(item: MediaItem): Thumb | null {
  if (item.thumb) return item.thumb
  if (item.rating == null || SHELVES[shelfOf(item)].stars) return null
  return item.rating >= 4 ? 'up' : item.rating === 3 ? 'meh' : 'down'
}

export const isRated = (item: MediaItem) => (SHELVES[shelfOf(item)].stars ? item.rating != null : thumbOf(item) != null)

/** Setting a thumb clears any old stars, so the two never disagree. */
export const setThumb = (id: string, thumb: Thumb | null) => update(db.media, id, { thumb, rating: null })
export const setFavorite = (id: string, favorite: boolean) => update(db.media, id, { favorite })

async function tickFinished(kind: MediaKind, date: string): Promise<void> {
  const tick = kind === 'book' ? 'read' : kind === 'watch' ? 'movie' : null
  if (tick) await setEntry(date, `tick:${tick}`, true)
}

export interface NewMediaFields {
  author?: string
  format?: 'movie' | 'show'
  /** When you started; `date` when left out. */
  started?: string
  /** When you finished, for a finished one; `date` when left out. */
  finished?: string
  /** Stars, for movies. */
  rating?: number | null
  /** For books, games and shows. */
  thumb?: Thumb | null
  favorite?: boolean
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
    rating: status === 'done' && kind === 'watch' && fields.format !== 'show' ? (fields.rating ?? null) : null,
    thumb: status === 'done' ? (fields.thumb ?? null) : null,
    favorite: fields.favorite ?? false,
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

export type MediaOrder = 'date' | 'rating'

const lastDate = (item: MediaItem) => item.finished ?? item.started ?? ''
const THUMB_SCORE: Record<Thumb, number> = { up: 3, meh: 2, down: 1 }
const score = (item: MediaItem) => {
  if (SHELVES[shelfOf(item)].stars) return item.rating ?? 0
  const thumb = thumbOf(item)
  return thumb ? THUMB_SCORE[thumb] : 0
}

/** Newest first, or best first (then newest). Unrated ones go last. */
export function sortMedia(items: readonly MediaItem[], order: MediaOrder): MediaItem[] {
  const byDate = (a: MediaItem, b: MediaItem) => lastDate(b).localeCompare(lastDate(a)) || b.updatedAt - a.updatedAt
  return [...items].sort(order === 'rating' ? (a, b) => score(b) - score(a) || byDate(a, b) : byDate)
}

/** How many were finished in a year, e.g. "2026". */
export const finishedIn = (items: readonly MediaItem[], year: string) =>
  items.filter((item) => item.status === 'done' && item.finished?.startsWith(year)).length
