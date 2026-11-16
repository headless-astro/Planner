import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { ALL_FEATURES } from './features'
import {
  SHELVES,
  addMedia,
  addSection,
  deleteSection,
  finishMedia,
  finishedIn,
  getShelves,
  groupMedia,
  isRated,
  listMedia,
  listSections,
  listShelf,
  sectionShelf,
  setCover,
  setThumb,
  singular,
  sortMedia,
  startMedia,
  thumbOf,
  updateSection,
  visibleShelves,
} from './media'
import { ensureSeeded, getDayValues } from './repo'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded()
})

describe('books, games and shows', () => {
  it('adds a book you started; finishing it ticks Read for that day', async () => {
    await addMedia('book', 'Dune', 'active', '2026-11-02', { author: 'Frank Herbert' })
    const [book] = await listMedia('book')
    expect(book).toMatchObject({ title: 'Dune', author: 'Frank Herbert', status: 'active', started: '2026-11-02', finished: null })
    await finishMedia(book.id, '2026-11-20')
    expect((await listMedia('book'))[0]).toMatchObject({ status: 'done', started: '2026-11-02', finished: '2026-11-20' })
    expect((await getDayValues('2026-11-20'))['tick:read']).toBe(true)
  })

  it('a movie watched today ticks Movie/Show; a finished game ticks nothing', async () => {
    await addMedia('watch', 'Arrival', 'done', '2026-11-02', { format: 'movie' })
    await addMedia('game', 'Hades', 'done', '2026-11-02')
    expect(await getDayValues('2026-11-02')).toEqual({ 'tick:movie': true })
    expect((await listMedia('watch'))[0]).toMatchObject({ format: 'movie', started: '2026-11-02', finished: '2026-11-02' })
  })

  it('groups what you are playing, want to play and finished', async () => {
    await addMedia('game', 'Stardew Valley', 'want', '2026-11-02')
    await addMedia('game', 'Celeste', 'want', '2026-11-02')
    await addMedia('game', 'Hades', 'done', '2025-12-30')
    const [celeste] = (await listMedia('game')).filter((game) => game.title === 'Celeste')
    await startMedia(celeste.id, '2026-11-03')

    const groups = groupMedia(await listMedia('game'))
    expect(groups.active.map((game) => game.title)).toEqual(['Celeste'])
    expect(groups.want.map((game) => game.title)).toEqual(['Stardew Valley'])
    expect(groups.finished.map((game) => game.title)).toEqual(['Hades'])
    expect(finishedIn(await listMedia('game'), '2026')).toBe(0)
    expect(finishedIn(await listMedia('game'), '2025')).toBe(1)
  })

  it('keeps movies and shows on their own tabs', async () => {
    await addMedia('watch', 'Arrival', 'done', '2026-11-02', { format: 'movie', rating: 5 })
    await addMedia('watch', 'Severance', 'active', '2026-11-02', { format: 'show', rating: 5, thumb: 'up' })
    expect((await listShelf('movies')).map((item) => item.title)).toEqual(['Arrival'])
    expect((await listShelf('shows')).map((item) => item.title)).toEqual(['Severance'])
    // Shows don't take stars.
    expect((await listShelf('shows'))[0].rating).toBeNull()
  })

  it('older star ratings on books, games and shows read as thumbs; setting a thumb clears them', async () => {
    await addMedia('book', 'Dune', 'done', '2026-11-02')
    const [book] = await listMedia('book')
    expect(thumbOf({ ...book, rating: 4 })).toBe('up')
    expect(thumbOf({ ...book, rating: 3 })).toBe('meh')
    expect(thumbOf({ ...book, rating: 2 })).toBe('down')
    expect(thumbOf({ ...book, kind: 'watch', format: 'movie', rating: 2 })).toBeNull()
    await setThumb(book.id, 'down')
    expect((await listMedia('book'))[0]).toMatchObject({ thumb: 'down', rating: null })
  })

  it('orders by date or by rating', async () => {
    await addMedia('game', 'Hades', 'done', '2026-10-01', { thumb: 'up' })
    await addMedia('game', 'Celeste', 'done', '2026-11-01', { thumb: 'meh' })
    await addMedia('game', 'Inside', 'done', '2026-10-15')
    const games = await listMedia('game')
    expect(sortMedia(games, 'date').map((game) => game.title)).toEqual(['Celeste', 'Inside', 'Hades'])
    expect(sortMedia(games, 'rating').map((game) => game.title)).toEqual(['Hades', 'Celeste', 'Inside'])
  })
})

describe('your own sections (F77)', () => {
  it('adds a section with its own words, which More lists after the built-in tabs', async () => {
    const id = await addSection({ title: 'Podcasts', log: 'Listening', want: 'Want to listen', by: 'Host' })
    const [section] = await listSections()
    expect(section).toMatchObject({ id, title: 'Podcasts', one: 'podcast', log: 'Listening', want: 'Want to listen', done: '', by: 'Host', stars: false })
    expect(sectionShelf(section)).toMatchObject({ key: id, href: `#/shelf/${id}`, kind: 'other', active: 'Listening', done: 'Finished', by: 'Host', tick: null, custom: true })
    expect((await getShelves()).map((info) => info.title)).toEqual(['Books', 'Games', 'Movies', 'Shows', 'Podcasts'])
  })

  it('keeps what is in a section on its own tab, with the second field; finishing ticks nothing', async () => {
    const podcasts = await addSection({ title: 'Podcasts', by: 'Host' })
    const albums = await addSection({ title: 'Albums', stars: true })
    await addMedia('other', 'Serial', 'done', '2026-11-02', { section: podcasts, author: 'Sarah Koenig', thumb: 'up' })
    await addMedia('other', 'Blue', 'done', '2026-11-02', { section: albums, rating: 5 })
    await addMedia('book', 'Dune', 'active', '2026-11-02')
    expect((await listShelf(podcasts)).map((item) => [item.title, item.author, item.thumb])).toEqual([['Serial', 'Sarah Koenig', 'up']])
    const [blue] = await listShelf(albums)
    expect(blue).toMatchObject({ rating: 5, thumb: null })
    expect(isRated(blue)).toBe(true)
    expect(thumbOf(blue)).toBeNull()
    expect((await listShelf('books')).map((item) => item.title)).toEqual(['Dune'])
    expect(await db.entries.count()).toBe(0)
  })

  it('hidden sections and parts turned off stay out of More', async () => {
    const podcasts = await addSection({ title: 'Podcasts' })
    await addSection({ title: 'Albums' })
    await updateSection(podcasts, { off: true })
    const features = { ...ALL_FEATURES, games: false }
    const shown = visibleShelves(await getShelves(), await listSections(), features).map((info) => info.title)
    expect(shown).toEqual(['Books', 'Movies', 'Shows', 'Albums'])
  })

  it('renames a section, and deleting it deletes what is in it', async () => {
    const id = await addSection({ title: 'Podcasts' })
    await addMedia('other', 'Serial', 'want', '2026-11-02', { section: id })
    await updateSection(id, { title: 'Shows to hear', one: 'audio show' })
    expect(sectionShelf((await listSections())[0])).toMatchObject({ title: 'Shows to hear', one: 'audio show' })
    await deleteSection(id)
    expect(await listSections()).toEqual([])
    expect(await listShelf(id)).toEqual([])
    // Kept as deleted, so the deletion syncs.
    expect((await db.settings.get('sections'))?.value).toMatchObject({ list: [{ id, deleted: true }] })
  })

  it('guesses what one of them is called', () => {
    expect(['Podcasts', 'Board games', 'Courses', 'Comics', 'Series', 'Diaries', 'Plays', 'Anime'].map(singular)).toEqual([
      'podcast',
      'board game',
      'course',
      'comic',
      'series',
      'diary',
      'play',
      'anime',
    ])
  })

  it('built-in tabs keep their words', () => {
    expect(SHELVES.books).toMatchObject({ by: 'Author', cover: 'book', href: '#/books' })
    expect(SHELVES.movies).toMatchObject({ stars: true, cover: 'movie' })
  })
})

describe('covers (F78)', () => {
  it('a new title has no cover looked up yet; a cover can be set and taken off', async () => {
    await addMedia('book', 'Dune', 'want', '2026-11-02')
    const [book] = await listMedia('book')
    expect(book.cover).toBeUndefined()
    await setCover(book.id, 'https://covers.openlibrary.org/b/id/1-M.jpg')
    expect((await listMedia('book'))[0].cover).toBe('https://covers.openlibrary.org/b/id/1-M.jpg')
    await setCover(book.id, null)
    expect((await listMedia('book'))[0].cover).toBeNull()
  })
})
