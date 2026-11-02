// Letterboxd (your movie diary and watchlist live there too). Two ways in, both by hand:
// importing the export file from Letterboxd's settings, and "Check Letterboxd", which asks the
// sync server to read your public diary feed. Neither ever writes to Letterboxd.
import { db, type MediaItem } from './db'
import { getSetting, setEntry } from './repo'
import { alive, now, update } from './store'
import { getSyncConfig, serverCall } from './sync'

export interface LetterboxdSettings {
  username: string
}

export const getLetterboxd = () => getSetting<LetterboxdSettings>('letterboxd', { username: '' })

export async function setLetterboxdUsername(username: string): Promise<void> {
  const value: LetterboxdSettings = { username: username.trim().replace(/^@/, '') }
  await db.settings.put({ id: 'letterboxd', value, updatedAt: now() })
}

export const profileLink = (username: string) => `https://letterboxd.com/${encodeURIComponent(username)}/`

/** One viewing, or a film marked watched without a date. */
export interface FilmLog {
  title: string
  year: number | null
  /** YYYY-MM-DD, or null when Letterboxd only knows it was watched. */
  watched: string | null
  /** Letterboxd's 0.5–5 stars, or null. */
  rating: number | null
  /** Hearted on Letterboxd. */
  liked?: boolean
}

export interface FilmList {
  watched: FilmLog[]
  watchlist: { title: string; year: number | null }[]
  /** Films hearted on Letterboxd: they get the heart here too. */
  liked?: { title: string; year: number | null }[]
}

export interface MergeResult {
  added: number
  updated: number
}

const filmKey = (title: string, year: number | null) => `${title.trim().toLowerCase()}|${year ?? ''}`
const filmId = (title: string, year: number | null) => `letterboxd|${filmKey(title, year)}`
/** Whole stars, as the app rates: 3.5 becomes 4, a half star becomes 1. */
const stars = (rating: number | null) => (rating === null ? null : Math.min(5, Math.max(1, Math.round(rating))))

/**
 * Brings films into Movies & shows. A film already here (the same title, and the same year
 * when both have one) is updated, never duplicated: something you wanted to watch becomes
 * finished, and only empty dates and ratings are filled in, so your own edits stay. Each
 * watched day ticks Movie/Show.
 */
export async function mergeFilms(list: FilmList): Promise<MergeResult> {
  const items = alive(await db.media.where('kind').equals('watch').toArray())
  const find = (title: string, year: number | null) =>
    items.find((item) => item.id === filmId(title, year)) ??
    items.find((item) => item.title.trim().toLowerCase() === title.trim().toLowerCase() && (item.year == null || year === null || item.year === year))

  // All viewings of a film together: the latest day is when it was finished.
  const films = new Map<string, { title: string; year: number | null; days: string[]; rating: number | null }>()
  for (const log of list.watched) {
    const key = filmKey(log.title, log.year)
    const film = films.get(key) ?? { title: log.title, year: log.year, days: [], rating: null }
    if (log.watched) film.days.push(log.watched)
    film.rating = log.rating ?? film.rating
    films.set(key, film)
  }

  const liked = new Set([...(list.liked ?? []), ...list.watched.filter((log) => log.liked)].map((film) => filmKey(film.title, film.year)))
  const result: MergeResult = { added: 0, updated: 0 }
  const ticked = new Set<string>()
  for (const film of films.values()) {
    const days = [...film.days].sort()
    const last = days.at(-1) ?? null
    const existing = find(film.title, film.year)
    if (existing) {
      const changes: Partial<MediaItem> = {}
      if (existing.status !== 'done') Object.assign(changes, { status: 'done', finished: existing.finished ?? last, started: existing.started ?? last })
      else {
        if (!existing.finished && last) changes.finished = last
        if (!existing.started && last) changes.started = last
      }
      if (existing.rating === null && film.rating !== null) changes.rating = stars(film.rating)
      if (existing.year == null && film.year !== null) changes.year = film.year
      if (!existing.favorite && liked.has(filmKey(film.title, film.year))) changes.favorite = true
      if (Object.keys(changes).length) {
        await update(db.media, existing.id, changes)
        result.updated++
      }
    } else {
      const item: MediaItem = {
        id: filmId(film.title, film.year),
        kind: 'watch',
        title: film.title,
        author: '',
        format: 'movie',
        genre: '',
        status: 'done',
        started: last,
        finished: last,
        rating: stars(film.rating),
        favorite: liked.has(filmKey(film.title, film.year)),
        notes: '',
        year: film.year,
        updatedAt: now(),
      }
      await db.media.put(item)
      items.push(item)
      result.added++
    }
    for (const day of days) ticked.add(day)
  }

  for (const film of list.watchlist) {
    if (find(film.title, film.year)) continue
    const item: MediaItem = {
      id: filmId(film.title, film.year),
      kind: 'watch',
      title: film.title,
      author: '',
      format: 'movie',
      genre: '',
      status: 'want',
      started: null,
      finished: null,
      rating: null,
      notes: '',
      year: film.year,
      updatedAt: now(),
    }
    await db.media.put(item)
    items.push(item)
    result.added++
  }

  // Hearts on films that are only in the likes list (already here, but not in this diary).
  for (const film of list.liked ?? []) {
    const existing = find(film.title, film.year)
    if (existing && !existing.favorite && !films.has(filmKey(film.title, film.year))) {
      await update(db.media, existing.id, { favorite: true })
      existing.favorite = true
      result.updated++
    }
  }

  for (const day of ticked) {
    const entry = await db.entries.get(`${day}|tick:movie`)
    if (!(entry && !entry.deleted && entry.value === true)) await setEntry(day, 'tick:movie', true)
  }
  return result
}

// ── The export file ──

/** Rows of a CSV file as objects keyed by the header row. Handles quotes and commas in titles. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const input = text.replace(/^﻿/, '')
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += char
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...body] = rows.filter((cells) => cells.some((cell) => cell.trim()))
  if (!header) return []
  return body.map((cells) => Object.fromEntries(header.map((name, index) => [name.trim(), (cells[index] ?? '').trim()])))
}

const yearOf = (text: string | undefined) => {
  const year = Number(text)
  return Number.isInteger(year) && year > 0 ? year : null
}
const dateOf = (text: string | undefined) => (text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null)
const ratingOf = (text: string | undefined) => {
  const rating = Number(text)
  return text && rating > 0 ? rating : null
}

/**
 * The films in Letterboxd's export files: diary.csv (viewings with dates), watched.csv
 * (everything marked watched), ratings.csv, watchlist.csv and likes/films.csv (hearted films).
 * Any of them can be missing.
 */
export function readExportFiles(files: Record<string, string>): FilmList {
  const rows = (name: string) => {
    const entry = Object.entries(files).find(([path]) => path.toLowerCase().split('/').pop() === name)
    return entry ? parseCsv(entry[1]) : []
  }
  const ratings = new Map(rows('ratings.csv').map((row) => [filmKey(row.Name, yearOf(row.Year)), ratingOf(row.Rating)]))
  const watched: FilmLog[] = rows('diary.csv').map((row) => ({
    title: row.Name,
    year: yearOf(row.Year),
    watched: dateOf(row['Watched Date']) ?? dateOf(row.Date),
    rating: ratingOf(row.Rating),
  }))
  const inDiary = new Set(watched.map((log) => filmKey(log.title, log.year)))
  // Films marked watched without a diary entry: Letterboxd's date there is when you marked
  // it, not when you watched it, so they come in without a date.
  for (const row of rows('watched.csv')) {
    const key = filmKey(row.Name, yearOf(row.Year))
    if (!inDiary.has(key)) watched.push({ title: row.Name, year: yearOf(row.Year), watched: null, rating: null })
  }
  for (const log of watched) log.rating ??= ratings.get(filmKey(log.title, log.year)) ?? null
  return {
    watched: watched.filter((log) => log.title),
    watchlist: rows('watchlist.csv')
      .map((row) => ({ title: row.Name, year: yearOf(row.Year) }))
      .filter((film) => film.title),
    liked: rows('films.csv')
      .map((row) => ({ title: row.Name, year: yearOf(row.Year) }))
      .filter((film) => film.title),
  }
}

/** Reads the export: the .zip Letterboxd gives you, or the .csv files from inside it. */
export async function importExport(files: readonly File[]): Promise<MergeResult> {
  const texts: Record<string, string> = {}
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      const { unzipSync, strFromU8 } = await import('fflate')
      const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (entry) => entry.name.toLowerCase().endsWith('.csv') })
      for (const [path, bytes] of Object.entries(entries)) {
        // Not the folders of lists, likes and deleted entries, which have files of the same names;
        // only likes/films.csv, the films you hearted.
        const lower = path.toLowerCase()
        const folders = lower.split('/').slice(0, -1)
        const skipped = folders.some((folder) => ['lists', 'likes', 'deleted', 'orphaned'].includes(folder))
        if (!skipped || lower.endsWith('likes/films.csv')) texts[path] = strFromU8(bytes)
      }
    } else texts[file.name] = await file.text()
  }
  const list = readExportFiles(texts)
  if (!list.watched.length && !list.watchlist.length) throw new Error('No films found. Choose the .zip from Letterboxd, or diary.csv, watched.csv and watchlist.csv.')
  return mergeFilms(list)
}

// ── "Check Letterboxd" ──

interface DiaryAnswer {
  entries: { title: string; year: number | null; watched: string | null; rating: number | null; liked?: boolean }[]
}

/** Asks the sync server to read your Letterboxd diary feed (the latest 50 entries) and brings them in. */
export async function checkLetterboxd(): Promise<MergeResult> {
  const [config, settings] = await Promise.all([getSyncConfig(), getLetterboxd()])
  if (!settings.username) throw new Error('Add your Letterboxd username in Settings → Setup first.')
  if (!config) throw new Error('Checking Letterboxd goes through your sync server. Connect this device in Settings → Sync first.')
  const answer = await serverCall<DiaryAnswer>(config, '/letterboxd', { username: settings.username })
  return mergeFilms({ watched: answer.entries, watchlist: [] })
}
