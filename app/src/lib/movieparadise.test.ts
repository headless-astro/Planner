import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addMedia, listMedia } from './media'
import {
  checkMovieParadise,
  connectMovieParadise,
  fromMovieParadise,
  getMovieParadise,
  mergeShows,
  playDay,
  thumbFrom,
  type MpLibraryItem,
  type MpMedia,
  type MpPlay,
} from './movieparadise'
import { getDayValues } from './repo'

const TOKEN = `mp_pat_${'a'.repeat(43)}abc123`
const movie = (mp: number, title: string, year: number | null = 2020): MpMedia => ({ type: 'movie', title, year, ids: { mp } })
const show = (mp: number, title: string, year: number | null = 2020): MpMedia => ({ type: 'show', title, year, ids: { mp } })
const libraryItem = (media: MpMedia, status: string | null, fields: Partial<MpLibraryItem> = {}): MpLibraryItem => ({ media, status, favorite: false, rating: null, ...fields })
// Noon UTC, so the day is the same in any time zone the tests run in.
const at = (day: string) => `${day}T12:00:00Z`

beforeEach(async () => {
  await db.delete()
  await db.open()
})

/** A stand-in for Movie Paradise: answers by path, in pages when given more than one. */
function server(routes: Record<string, unknown[][]>, status = 200) {
  const asked: { url: string; auth: string | null }[] = []
  const fetcher = async (url: string, init?: RequestInit) => {
    asked.push({ url, auth: new Headers(init?.headers).get('Authorization') })
    if (status !== 200) return new Response(JSON.stringify({ title: 'Nope', detail: 'refused' }), { status, headers: { 'Retry-After': '600' } })
    const parsed = new URL(url)
    if (parsed.pathname === '/v1/me') return new Response(JSON.stringify({ username: 'vaveyla', credential: { expires_at: '2027-02-14T10:00:00Z' } }))
    const key = `${parsed.pathname}${parsed.searchParams.get('type') ? `?type=${parsed.searchParams.get('type')}` : ''}`
    const pages = routes[key] ?? [[]]
    const index = Number(parsed.searchParams.get('cursor') ?? 0)
    return new Response(JSON.stringify({ items: pages[index] ?? [], next_cursor: index + 1 < pages.length ? String(index + 1) : null, complete: index + 1 >= pages.length, as_of: '' }))
  }
  return { asked, fetcher }
}

describe('Movie Paradise (F81)', () => {
  it('connects with a token, kept on this device', async () => {
    const { asked, fetcher } = server({})
    await expect(connectMovieParadise('not a token', fetcher)).rejects.toThrow('starts with mp_pat_')
    expect(await connectMovieParadise(` ${TOKEN} `, fetcher)).toEqual({ token: TOKEN, username: 'vaveyla', expires: '2027-02-14' })
    expect(asked[0]).toEqual({ url: 'https://platform.movieparadise.app/v1/me', auth: `Bearer ${TOKEN}` })
    expect((await getMovieParadise())?.username).toBe('vaveyla')
    // Not in a synced table.
    expect(await db.settings.get('movieParadise')).toBeUndefined()
  })

  it('says what a refused token or a used-up limit means', async () => {
    await expect(connectMovieParadise(TOKEN, server({}, 401).fetcher)).rejects.toThrow('may have run out')
    await expect(connectMovieParadise(TOKEN, server({}, 429).fetcher)).rejects.toThrow('Try again in about 10 minutes')
  })

  it('turns the library and plays into films and shows', () => {
    const library = [
      libraryItem(movie(1, 'Arrival', 2016), 'watched', { rating: 9, favorite: true }),
      libraryItem(movie(2, 'Paterson', 2016), 'watched', { rating: 7 }),
      libraryItem(movie(3, 'Dune', 2021), 'to_watch'),
      libraryItem(movie(4, 'Tár', 2022), 'watching'),
      libraryItem(movie(5, 'Cats', 2019), 'dropped'),
      libraryItem(show(10, 'Severance', 2022), 'up_to_date', { rating: 8.5 }),
      libraryItem(show(11, 'Dark', 2017), 'finished', { rating: 6 }),
      libraryItem(show(12, 'Lost', 2004), 'not_started'),
      libraryItem(show(13, 'Glee', 2009), 'dropped', { rating: 3 }),
    ]
    const plays: MpPlay[] = [
      { type: 'movie', watched_at: at('2026-10-01'), movie: movie(1, 'Arrival', 2016) },
      { type: 'movie', watched_at: at('2026-11-01'), movie: movie(1, 'Arrival', 2016) },
      { type: 'episode', watched_at: at('2026-09-03'), show: show(11, 'Dark', 2017) },
      { type: 'episode', watched_at: at('2026-09-01'), show: show(11, 'Dark', 2017) },
      { type: 'episode', watched_at: null, show: show(10, 'Severance', 2022) },
    ]
    const { films, shows } = fromMovieParadise(library, plays)
    expect(films.watched).toEqual([
      { title: 'Arrival', year: 2016, watched: '2026-10-01', rating: 4.5, liked: true },
      { title: 'Arrival', year: 2016, watched: '2026-11-01', rating: 4.5, liked: true },
      { title: 'Paterson', year: 2016, watched: null, rating: 3.5, liked: false },
    ])
    expect(films.watchlist).toEqual([{ title: 'Dune', year: 2021 }])
    expect(films.liked).toEqual([{ title: 'Arrival', year: 2016 }])
    // Being watched comes in; dropped doesn't.
    expect(films.watching).toEqual([{ title: 'Tár', year: 2022 }])
    expect(shows.map((log) => [log.title, log.status, log.days])).toEqual([
      ['Severance', 'active', []],
      ['Dark', 'done', ['2026-09-01', '2026-09-03']],
      ['Lost', 'want', []],
      ['Glee', 'stopped', []],
    ])
  })

  it('thumbs from a 10-point rating, and the day turns over at 06:00', () => {
    expect([9, 7, 6.5, 5, 4.9, null].map(thumbFrom)).toEqual(['up', 'up', 'meh', 'meh', 'down', null])
    expect(playDay(null)).toBeNull()
    expect(playDay(new Date(2026, 10, 3, 2, 0).toISOString())).toBe('2026-11-02')
  })

  it('brings shows in, moving one already here forward without undoing your edits', async () => {
    await addMedia('watch', 'Severance', 'want', '2026-11-02', { format: 'show' })
    const result = await mergeShows([
      { title: 'Severance', year: 2022, status: 'done', rating: 9, favorite: true, days: ['2026-10-10', '2026-10-12'] },
      { title: 'Dark', year: 2017, status: 'active', rating: null, favorite: false, days: ['2026-11-01'] },
    ])
    expect(result).toEqual({ added: 1, updated: 1 })
    const shows = await listMedia('watch')
    expect(shows.find((item) => item.title === 'Severance')).toMatchObject({ status: 'done', started: '2026-10-10', finished: '2026-10-12', thumb: 'up', favorite: true, year: 2022 })
    expect(shows.find((item) => item.title === 'Dark')).toMatchObject({ format: 'show', status: 'active', started: '2026-11-01', finished: null })
    expect((await getDayValues('2026-10-12'))['tick:movie']).toBe(true)
    // A second check changes nothing.
    expect(await mergeShows([{ title: 'Severance', year: 2022, status: 'active', rating: 2, favorite: false, days: [] }])).toEqual({ added: 0, updated: 0 })
  })

  it('brings films being watched into Watching, moving one on from Want to watch', async () => {
    await addMedia('watch', 'Dune', 'want', '2026-11-02', { format: 'movie' })
    await addMedia('watch', 'Heat', 'done', '2026-11-02', { format: 'movie' })
    const { fetcher } = server({
      '/v1/library': [[
        libraryItem(movie(3, 'Dune', 2021), 'watching'),
        libraryItem(movie(4, 'Tár', 2022), 'watching'),
        libraryItem(movie(6, 'Heat', 1995), 'watching'),
      ]],
    })
    await connectMovieParadise(TOKEN, fetcher)
    expect(await checkMovieParadise(fetcher)).toEqual({ added: 1, updated: 1 })
    const items = await listMedia('watch')
    expect(items.find((item) => item.title === 'Dune')?.status).toBe('active')
    expect(items.find((item) => item.title === 'Tár')).toMatchObject({ format: 'movie', status: 'active', finished: null })
    // A film you finished stays finished.
    expect(items.find((item) => item.title === 'Heat')?.status).toBe('done')
    // A second check changes nothing.
    expect(await checkMovieParadise(fetcher)).toEqual({ added: 0, updated: 0 })
  })

  it('"Check Movie Paradise" reads every page and brings films and shows in', async () => {
    const { asked, fetcher } = server({
      '/v1/library': [[libraryItem(movie(1, 'Arrival', 2016), 'watched', { rating: 8 })], [libraryItem(show(10, 'Dark', 2017), 'watching')]],
      '/v1/sync/history?type=movies': [[{ type: 'movie', watched_at: at('2026-10-01'), movie: movie(1, 'Arrival', 2016) }]],
      '/v1/sync/history?type=episodes': [[{ type: 'episode', watched_at: at('2026-10-05'), show: show(10, 'Dark', 2017) }]],
    })
    await expect(checkMovieParadise(fetcher)).rejects.toThrow('Connect Movie Paradise first')
    await connectMovieParadise(TOKEN, fetcher)
    expect(await checkMovieParadise(fetcher)).toEqual({ added: 2, updated: 0 })
    const items = await listMedia('watch')
    expect(items.find((item) => item.title === 'Arrival')).toMatchObject({ format: 'movie', status: 'done', finished: '2026-10-01', rating: 4 })
    expect(items.find((item) => item.title === 'Dark')).toMatchObject({ format: 'show', status: 'active', started: '2026-10-05' })
    const libraryCalls = asked.filter((call) => new URL(call.url).pathname === '/v1/library').map((call) => new URL(call.url).searchParams.get('cursor'))
    expect(libraryCalls).toEqual([null, '1'])
    expect(asked.every((call) => call.auth === `Bearer ${TOKEN}`)).toBe(true)
  })
})
