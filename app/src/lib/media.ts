// Books, games, movies and shows (PLAN.md S18, F16), plus sections you add yourself (F77).
// They stay off Today; finishing a book or a movie or show ticks Read or Movie/Show for the day (F5).
import { db, type MediaItem, type MediaKind, type Thumb } from './db'
import { getSetting, setEntry } from './repo'
import { alive, newId, now, softDelete, update } from './store'

/** The four built-in tabs. Movies and shows are both `watch` items, told apart by `format`. */
export type BuiltInShelf = 'books' | 'games' | 'movies' | 'shows'
/** A built-in tab, or the id of one of your own sections. */
export type Shelf = string

/** Where a cover is looked up (F78). */
export type CoverSource = 'book' | 'show' | 'movie' | 'game' | 'other'

export interface ShelfInfo {
  /** `books`, or your own section's id. */
  key: Shelf
  /** The link to its first sub-tab: #/books, or #/shelf/<id>. */
  href: string
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
  /** The label of the second field (Author for books, Artist…), or '' for none. */
  by: string
  cover: CoverSource
  /** One of your own sections (F77). */
  custom: boolean
}

export const SHELVES: Record<BuiltInShelf, ShelfInfo> = {
  books: {
    key: 'books',
    href: '#/books',
    kind: 'book',
    format: null,
    title: 'Books',
    log: 'Reading',
    done: 'Finished',
    one: 'book',
    active: 'Reading now',
    want: 'Want to read',
    tick: 'read',
    stars: false,
    by: 'Author',
    cover: 'book',
    custom: false,
  },
  games: {
    key: 'games',
    href: '#/games',
    kind: 'game',
    format: null,
    title: 'Games',
    log: 'Playing',
    done: 'Finished',
    one: 'game',
    active: 'Playing now',
    want: 'Want to play',
    tick: null,
    stars: false,
    by: '',
    cover: 'game',
    custom: false,
  },
  movies: {
    key: 'movies',
    href: '#/movies',
    kind: 'watch',
    format: 'movie',
    title: 'Movies',
    log: 'Watching',
    done: 'Watched',
    one: 'movie',
    active: 'Watching now',
    want: 'Want to watch',
    tick: 'movie',
    stars: true,
    by: '',
    cover: 'movie',
    custom: false,
  },
  shows: {
    key: 'shows',
    href: '#/shows',
    kind: 'watch',
    format: 'show',
    title: 'Shows',
    log: 'Watching',
    done: 'Finished',
    one: 'show',
    active: 'Watching now',
    want: 'Want to watch',
    tick: 'movie',
    stars: false,
    by: '',
    cover: 'show',
    custom: false,
  },
}

export const BUILT_IN_SHELVES: ShelfInfo[] = Object.values(SHELVES)

export const isBuiltInShelf = (key: string): key is BuiltInShelf => Object.hasOwn(SHELVES, key)

// ── Your own sections (F77) ──

/** A section you added to More: podcasts, albums, board games… */
export interface CustomSection {
  id: string
  /** "Podcasts". */
  title: string
  /** "podcast", as in "Add a podcast". */
  one: string
  /** The sub-tab with what you're on now: "Listening". Empty for the default. */
  log: string
  /** The sub-tab with what you'd like to get to: "Want to listen". Empty for the default. */
  want: string
  /** The sub-tab with what you finished. Empty for the default. */
  done: string
  /** A second field, like "Artist" or "Host"; '' for none. */
  by: string
  /** 1–5 stars instead of thumbs. */
  stars: boolean
  /** Hidden from More, like a part that's turned off. */
  off?: boolean
  deleted?: boolean
}

export const SECTION_DEFAULTS = { log: 'Current', want: 'Want to try', done: 'Finished' } as const

/** Everything you see on a section's screen, worked out from what you set. */
export function sectionShelf(section: CustomSection): ShelfInfo {
  const title = section.title.trim() || 'Untitled'
  const log = section.log.trim() || SECTION_DEFAULTS.log
  return {
    key: section.id,
    href: `#/shelf/${section.id}`,
    kind: 'other',
    format: null,
    title,
    log,
    done: section.done.trim() || SECTION_DEFAULTS.done,
    one: section.one.trim() || singular(title),
    active: log,
    want: section.want.trim() || SECTION_DEFAULTS.want,
    tick: null,
    stars: section.stars,
    by: section.by.trim(),
    cover: 'other',
    custom: true,
  }
}

/** Your sections, deleted ones included (so they sync as deleted). */
async function allSections(): Promise<CustomSection[]> {
  const { list } = await getSetting<{ list: CustomSection[] }>('sections', { list: [] })
  return Array.isArray(list) ? list : []
}

export const listSections = async () => (await allSections()).filter((section) => !section.deleted)

async function saveSections(list: CustomSection[]): Promise<void> {
  // A plain copy: lists edited on screen can arrive wrapped, and the database only stores plain data.
  await db.settings.put({ id: 'sections', value: { list: JSON.parse(JSON.stringify(list)) as CustomSection[] }, updatedAt: now() })
}

export type NewSection = Pick<CustomSection, 'title'> & Partial<Omit<CustomSection, 'id' | 'title' | 'deleted'>>

/** "Podcasts" → "podcast": a guess at one of them, which you can change. */
export function singular(title: string): string {
  const word = title.trim().toLowerCase()
  if (/(ss|us|is|series|species)$/.test(word)) return word
  if (/[^aeiou]ies$/.test(word)) return word.replace(/ies$/, 'y')
  return word.replace(/s$/, '')
}

export async function addSection(fields: NewSection): Promise<string> {
  const id = newId()
  await db.transaction('rw', db.settings, async () => {
    const title = fields.title.trim()
    const section: CustomSection = {
      id,
      title,
      one: fields.one?.trim() || singular(title),
      log: fields.log?.trim() ?? '',
      want: fields.want?.trim() ?? '',
      done: fields.done?.trim() ?? '',
      by: fields.by?.trim() ?? '',
      stars: fields.stars ?? false,
    }
    await saveSections([...(await allSections()), section])
  })
  return id
}

export async function updateSection(id: string, changes: Partial<Omit<CustomSection, 'id'>>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    await saveSections((await allSections()).map((section) => (section.id === id ? { ...section, ...changes } : section)))
  })
}

/** Deletes a section and what's in it. */
export async function deleteSection(id: string): Promise<void> {
  await updateSection(id, { deleted: true })
  for (const item of await listShelf(id)) await softDelete(db.media, item.id)
}

/** Every tab in More, the built-in ones first, including the ones that are turned off. */
export async function getShelves(): Promise<ShelfInfo[]> {
  return [...BUILT_IN_SHELVES, ...(await listSections()).map(sectionShelf)]
}

/** The tabs that show in More: built-in ones that are on, and your sections that aren't hidden. */
export function visibleShelves(shelves: readonly ShelfInfo[], sections: readonly CustomSection[], features: Record<BuiltInShelf, boolean>): ShelfInfo[] {
  const hidden = new Set(sections.filter((section) => section.off).map((section) => section.id))
  return shelves.filter((info) => (isBuiltInShelf(info.key) ? features[info.key] : !hidden.has(info.key)))
}

export function shelfOf(item: Pick<MediaItem, 'kind' | 'format' | 'section'>): Shelf {
  if (item.kind === 'other') return item.section ?? ''
  if (item.kind === 'book') return 'books'
  if (item.kind === 'game') return 'games'
  return item.format === 'show' ? 'shows' : 'movies'
}

/** Rated in stars: movies, and anything in your own sections that was given stars. */
const usesStars = (item: MediaItem) => (item.kind === 'other' ? item.rating != null && !item.thumb : item.kind === 'watch' && item.format !== 'show')

export async function listMedia(kind: MediaKind): Promise<MediaItem[]> {
  return alive(await db.media.where('kind').equals(kind).toArray())
}

export async function listShelf(shelf: Shelf): Promise<MediaItem[]> {
  const kind = isBuiltInShelf(shelf) ? SHELVES[shelf].kind : 'other'
  return (await listMedia(kind)).filter((item) => shelfOf(item) === shelf)
}

/** The thumb for a book, game or show. Older ones rated in stars count 4–5 as up, 3 as neutral, 1–2 as down. */
export function thumbOf(item: MediaItem): Thumb | null {
  if (item.thumb) return item.thumb
  if (item.rating == null || usesStars(item)) return null
  return item.rating >= 4 ? 'up' : item.rating === 3 ? 'meh' : 'down'
}

export const isRated = (item: MediaItem) => (usesStars(item) ? item.rating != null : thumbOf(item) != null)

/** Setting a thumb clears any old stars, so the two never disagree. */
export const setThumb = (id: string, thumb: Thumb | null) => update(db.media, id, { thumb, rating: null })
export const setFavorite = (id: string, favorite: boolean) => update(db.media, id, { favorite })
/** A cover's address, or null for none (F78). */
export const setCover = (id: string, cover: string | null) => update(db.media, id, { cover })

async function tickFinished(kind: MediaKind, date: string): Promise<void> {
  const tick = kind === 'book' ? 'read' : kind === 'watch' ? 'movie' : null
  if (tick) await setEntry(date, `tick:${tick}`, true)
}

export interface NewMediaFields {
  /** Books' author, or your own section's second field. */
  author?: string
  /** Your own section (F77), for `other` items. */
  section?: string
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
    author: kind === 'book' || kind === 'other' ? (fields.author ?? '') : '',
    format: kind === 'watch' ? (fields.format ?? 'movie') : null,
    genre: '',
    status,
    started,
    finished,
    rating: status === 'done' && ((kind === 'watch' && fields.format !== 'show') || kind === 'other') ? (fields.rating ?? null) : null,
    thumb: status === 'done' ? (fields.thumb ?? null) : null,
    favorite: fields.favorite ?? false,
    notes: '',
    ...(kind === 'other' ? { section: fields.section ?? '' } : {}),
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
  if (usesStars(item)) return item.rating ?? 0
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
