// Movie Paradise (movieparadise.app), a tracker for films and shows (F81). Its developer API
// answers browsers directly, so the app reads it itself with a token you make there: your
// films (watched, being watched, want to watch), shows, ratings, hearts, and the days you watched. Nothing goes through
// your server, and nothing is ever written to Movie Paradise. The token stays on this device
// (the meta table): it isn't synced and isn't in backups.
import { db, type MediaItem, type MediaStatus, type Thumb } from './db'
import { plannerDate, toISODate } from './dates'
import { mergeFilms, type FilmLog, type FilmList, type MergeResult } from './letterboxd'
import { setEntry } from './repo'
import { alive, now, update } from './store'

const BASE = 'https://platform.movieparadise.app/v1'
const META = 'movieParadise'

export interface MovieParadiseLink {
  token: string
  username: string
  /** When the token runs out, YYYY-MM-DD, if Movie Paradise said. */
  expires: string | null
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>
const browserFetch: Fetch = (url, init) => fetch(url, init)

export async function getMovieParadise(): Promise<MovieParadiseLink | null> {
  const row = await db.meta.get(META)
  const value = row?.value as Partial<MovieParadiseLink> | undefined
  return value && typeof value.token === 'string' ? { token: value.token, username: value.username ?? '', expires: value.expires ?? null } : null
}

export const disconnectMovieParadise = () => db.meta.delete(META)

/** What a refusal from Movie Paradise means for you. */
async function failure(response: Response): Promise<Error> {
  let detail = ''
  try {
    const problem = (await response.json()) as { detail?: string; title?: string }
    detail = problem.detail ?? problem.title ?? ''
  } catch {
    // No details; the status says enough.
  }
  if (response.status === 401) return new Error('Movie Paradise refused the token: it may have run out or been deleted. Make a new one and connect again.')
  if (response.status === 403) return new Error(`Movie Paradise refused this token${detail ? `: ${detail}` : ''}.`)
  if (response.status === 429) {
    const wait = Number(response.headers.get('Retry-After'))
    const later = Number.isFinite(wait) && wait > 0 ? (wait < 120 ? ` in ${Math.ceil(wait)} seconds` : ` in about ${Math.ceil(wait / 60)} minutes`) : ' later'
    return new Error(`Movie Paradise's limit for now is used up. Try again${later}.`)
  }
  return new Error(`Movie Paradise didn't answer (${response.status}${detail ? `: ${detail}` : ''}). Try again later.`)
}

async function call<T>(token: string, path: string, fetcher: Fetch): Promise<T> {
  let response: Response
  try {
    response = await fetcher(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new Error("Couldn't reach Movie Paradise. Are you online?")
  }
  if (!response.ok) throw await failure(response)
  return (await response.json()) as T
}

interface Page<T> {
  items: T[]
  next_cursor: string | null
}

/** Every page of a list, 500 at a time. */
async function readAll<T>(token: string, path: string, fetcher: Fetch): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null
  // A safe stop: 200 pages is 100,000 items.
  for (let page = 0; page < 200; page++) {
    const query = new URLSearchParams({ limit: '500', ...(cursor ? { cursor } : {}) })
    const answer: Page<T> = await call<Page<T>>(token, `${path}${path.includes('?') ? '&' : '?'}${query}`, fetcher)
    items.push(...(Array.isArray(answer.items) ? answer.items : []))
    cursor = answer.next_cursor
    if (!cursor) break
  }
  return items
}

/** Checks a token with Movie Paradise and keeps it on this device. */
export async function connectMovieParadise(input: string, fetcher: Fetch = browserFetch): Promise<MovieParadiseLink> {
  const token = input.trim()
  if (!/^mp_pat_[A-Za-z0-9_]{20,}$/.test(token)) throw new Error('That isn’t a Movie Paradise token. It starts with mp_pat_.')
  const me = await call<{ username?: string; credential?: { expires_at?: string } }>(token, '/me', fetcher)
  const link: MovieParadiseLink = { token, username: me.username ?? '', expires: me.credential?.expires_at?.slice(0, 10) ?? null }
  await db.meta.put({ id: META, value: link })
  return link
}

// ── What Movie Paradise sends (the parts used here) ──

export interface MpMedia {
  type: 'movie' | 'show'
  title: string
  year: number | null
  ids: { mp: number }
}

export interface MpLibraryItem {
  media: MpMedia
  status: string | null
  favorite: boolean
  /** 0.5–10. */
  rating: number | null
  added_at?: string
}

export interface MpPlay {
  type: 'movie' | 'episode'
  watched_at: string | null
  movie?: MpMedia
  show?: MpMedia
}

/** One show as it comes in. */
export interface ShowLog {
  title: string
  year: number | null
  status: MediaStatus
  /** Movie Paradise's 0.5–10. */
  rating: number | null
  favorite: boolean
  /** The days episodes were watched. */
  days: string[]
}

/** The planner day a play happened on: the day turns over at 06:00, as on Today. */
export const playDay = (at: string | null): string | null => {
  if (!at) return null
  const date = new Date(at)
  return Number.isNaN(date.getTime()) ? null : toISODate(plannerDate(date))
}

const SHOW_STATUS: Record<string, MediaStatus> = {
  not_started: 'want',
  watching: 'active',
  been_a_while: 'active',
  up_to_date: 'active',
  paused: 'active',
  finished: 'done',
  dropped: 'stopped',
}

/** Thumbs from a 10-point rating: 7 and up enjoyed, 5 to 7 okay, under 5 not. */
export const thumbFrom = (rating: number | null): Thumb | null => (rating === null ? null : rating >= 7 ? 'up' : rating >= 5 ? 'meh' : 'down')

/** Movie Paradise's library and plays as the film list Letterboxd uses, and a list of shows. */
export function fromMovieParadise(library: readonly MpLibraryItem[], plays: readonly MpPlay[]): { films: FilmList; shows: ShowLog[] } {
  const movies = library.filter((item) => item.media?.type === 'movie')
  const byId = new Map(movies.map((item) => [item.media.ids.mp, item]))
  const watched: FilmLog[] = []
  const played = new Set<number>()
  for (const play of plays) {
    if (play.type !== 'movie' || !play.movie) continue
    const item = byId.get(play.movie.ids.mp)
    played.add(play.movie.ids.mp)
    // Letterboxd's 0.5–5, which the film list takes.
    watched.push({ title: play.movie.title, year: play.movie.year, watched: playDay(play.watched_at), rating: item?.rating != null ? item.rating / 2 : null, liked: !!item?.favorite })
  }
  // Marked watched without a play.
  for (const item of movies) {
    if (item.status === 'watched' && !played.has(item.media.ids.mp)) {
      watched.push({ title: item.media.title, year: item.media.year, watched: null, rating: item.rating != null ? item.rating / 2 : null, liked: item.favorite })
    }
  }
  const films: FilmList = {
    watched,
    watchlist: movies.filter((item) => item.status === 'to_watch').map((item) => ({ title: item.media.title, year: item.media.year })),
    // Being watched, unless a play already finished it. Dropped films aren't brought in.
    watching: movies
      .filter((item) => item.status === 'watching' && !played.has(item.media.ids.mp))
      .map((item) => ({ title: item.media.title, year: item.media.year })),
    liked: movies.filter((item) => item.favorite).map((item) => ({ title: item.media.title, year: item.media.year })),
  }

  const days = new Map<number, Set<string>>()
  for (const play of plays) {
    if (play.type !== 'episode' || !play.show) continue
    const day = playDay(play.watched_at)
    if (!day) continue
    const set = days.get(play.show.ids.mp) ?? new Set<string>()
    set.add(day)
    days.set(play.show.ids.mp, set)
  }
  const shows = library
    .filter((item) => item.media?.type === 'show')
    .map((item): ShowLog => {
      const watchedDays = [...(days.get(item.media.ids.mp) ?? [])].sort()
      return {
        title: item.media.title,
        year: item.media.year,
        status: (item.status && SHOW_STATUS[item.status]) || (watchedDays.length ? 'active' : 'want'),
        rating: item.rating,
        favorite: item.favorite,
        days: watchedDays,
      }
    })
  return { films, shows }
}

const showKey = (title: string, year: number | null) => `${title.trim().toLowerCase()}|${year ?? ''}`
/** How far along a status is: a show only moves forward. */
const STATUS_RANK: Record<MediaStatus, number> = { want: 0, active: 1, stopped: 2, done: 3 }

/**
 * Brings shows into Shows. One already here (the same title, and the same year when both have
 * one) is updated, never doubled: it only moves forward (want to → watching → finished), and only
 * empty dates, thumbs and years are filled in, so your own edits stay. Each day you watched an
 * episode ticks Movie/Show.
 */
export async function mergeShows(shows: readonly ShowLog[]): Promise<MergeResult> {
  const items = alive(await db.media.where('kind').equals('watch').toArray()).filter((item) => item.format === 'show')
  const find = (title: string, year: number | null) =>
    items.find((item) => item.title.trim().toLowerCase() === title.trim().toLowerCase() && (item.year == null || year === null || item.year === year))
  const result: MergeResult = { added: 0, updated: 0 }
  const ticked = new Set<string>()
  for (const show of shows) {
    const first = show.days[0] ?? null
    const last = show.days.at(-1) ?? null
    const started = show.status === 'want' ? null : first
    const finished = show.status === 'done' || show.status === 'stopped' ? last : null
    const thumb = thumbFrom(show.rating)
    const existing = find(show.title, show.year)
    if (existing) {
      const changes: Partial<MediaItem> = {}
      if (STATUS_RANK[show.status] > STATUS_RANK[existing.status] && existing.status !== 'done') changes.status = show.status
      if (!existing.started && started) changes.started = started
      if (!existing.finished && finished) changes.finished = finished
      if (!existing.thumb && existing.rating == null && thumb && show.status === 'done') changes.thumb = thumb
      if (!existing.favorite && show.favorite) changes.favorite = true
      if (existing.year == null && show.year !== null) changes.year = show.year
      if (Object.keys(changes).length) {
        await update(db.media, existing.id, changes)
        result.updated++
      }
    } else {
      const item: MediaItem = {
        id: `movieparadise|show|${showKey(show.title, show.year)}`,
        kind: 'watch',
        title: show.title,
        author: '',
        format: 'show',
        genre: '',
        status: show.status,
        started,
        finished,
        rating: null,
        thumb: show.status === 'done' ? thumb : null,
        favorite: show.favorite,
        notes: '',
        year: show.year,
        updatedAt: now(),
      }
      await db.media.put(item)
      items.push(item)
      result.added++
    }
    for (const day of show.days) ticked.add(day)
  }
  for (const day of ticked) {
    const entry = await db.entries.get(`${day}|tick:movie`)
    if (!(entry && !entry.deleted && entry.value === true)) await setEntry(day, 'tick:movie', true)
  }
  return result
}

/**
 * "Check Movie Paradise": reads your library, film plays and episode plays (3 of the 20 whole
 * reads a day the free plan allows) and brings films and shows in.
 */
export async function checkMovieParadise(fetcher: Fetch = browserFetch): Promise<MergeResult> {
  const link = await getMovieParadise()
  if (!link) throw new Error('Connect Movie Paradise first, with a token from its Settings.')
  const library = await readAll<MpLibraryItem>(link.token, '/library', fetcher)
  const moviePlays = await readAll<MpPlay>(link.token, '/sync/history?type=movies', fetcher)
  const episodePlays = await readAll<MpPlay>(link.token, '/sync/history?type=episodes', fetcher)
  const { films, shows } = fromMovieParadise(library, [...moviePlays, ...episodePlays])
  const filmResult = await mergeFilms(films)
  const showResult = await mergeShows(shows)
  return { added: filmResult.added + showResult.added, updated: filmResult.updated + showResult.updated }
}
