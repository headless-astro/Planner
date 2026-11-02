import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { importExport, mergeFilms, parseCsv, readExportFiles } from './letterboxd'
import { addMedia, listMedia } from './media'
import { ensureSeeded, getDayValues } from './repo'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded()
})

const EXPORT = {
  'diary.csv':
    'Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n' +
    '2026-10-31,Past Lives,2023,https://boxd.it/a,4.5,,,2026-10-30\n' +
    '2026-10-02,"Crouching Tiger, Hidden Dragon",2000,https://boxd.it/b,,,,2026-10-01\n' +
    '2026-10-20,Past Lives,2023,https://boxd.it/c,4,Yes,,2026-10-19\n',
  'watched.csv': 'Date,Name,Year,Letterboxd URI\n2020-05-01,Arrival,2016,https://boxd.it/d\n2026-10-31,Past Lives,2023,https://boxd.it/e\n',
  'ratings.csv': 'Date,Name,Year,Letterboxd URI,Rating\n2020-05-01,Arrival,2016,https://boxd.it/d,3.5\n',
  'watchlist.csv': 'Date,Name,Year,Letterboxd URI\n2026-09-01,Aftersun,2022,https://boxd.it/f\n',
}

describe('Letterboxd', () => {
  it('reads CSV with quoted titles', () => {
    expect(parseCsv('Name,Year\r\n"Tom ""Cat""",2000\r\n"A, B",\r\n')).toEqual([
      { Name: 'Tom "Cat"', Year: '2000' },
      { Name: 'A, B', Year: '' },
    ])
  })

  it('reads the export: diary days, watched films without a day, ratings and the watchlist', () => {
    const list = readExportFiles(EXPORT)
    expect(list.watched).toEqual([
      { title: 'Past Lives', year: 2023, watched: '2026-10-30', rating: 4.5 },
      { title: 'Crouching Tiger, Hidden Dragon', year: 2000, watched: '2026-10-01', rating: null },
      { title: 'Past Lives', year: 2023, watched: '2026-10-19', rating: 4 },
      { title: 'Arrival', year: 2016, watched: null, rating: 3.5 },
    ])
    expect(list.watchlist).toEqual([{ title: 'Aftersun', year: 2022 }])
  })

  it('brings films in once, finished on the last day watched, and ticks each day', async () => {
    expect(await mergeFilms(readExportFiles(EXPORT))).toEqual({ added: 4, updated: 0 })
    const films = await listMedia('watch')
    expect(films.find((film) => film.title === 'Past Lives')).toMatchObject({ status: 'done', finished: '2026-10-30', rating: 4, year: 2023 })
    expect(films.find((film) => film.title === 'Arrival')).toMatchObject({ status: 'done', finished: null, rating: 4 })
    expect(films.find((film) => film.title === 'Aftersun')).toMatchObject({ status: 'want' })
    expect((await getDayValues('2026-10-19'))['tick:movie']).toBe(true)
    expect((await getDayValues('2026-10-30'))['tick:movie']).toBe(true)

    // Importing again changes nothing.
    expect(await mergeFilms(readExportFiles(EXPORT))).toEqual({ added: 0, updated: 0 })
    expect(await listMedia('watch')).toHaveLength(4)
  })

  it('updates a film you added yourself instead of doubling it, and keeps your rating', async () => {
    await addMedia('watch', 'past lives', 'want', '2026-10-01')
    await addMedia('watch', 'Arrival', 'done', '2026-11-01', { rating: 5 })
    await mergeFilms(readExportFiles(EXPORT))
    const films = await listMedia('watch')
    expect(films).toHaveLength(4)
    expect(films.find((film) => film.title === 'past lives')).toMatchObject({ status: 'done', finished: '2026-10-30', rating: 4 })
    expect(films.find((film) => film.title === 'Arrival')).toMatchObject({ finished: '2026-11-01', rating: 5 })
  })
})

describe('the export .zip', () => {
  it('reads the files at the top and skips the likes, lists and deleted folders', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const zip = zipSync({
      'watched.csv': strToU8(EXPORT['watched.csv']),
      'watchlist.csv': strToU8(EXPORT['watchlist.csv']),
      'likes/films.csv': strToU8('Date,Name,Year,Letterboxd URI\n2026-01-01,Liked Only,2001,x\n2026-01-02,Arrival,2016,y\n'),
      'deleted/diary.csv': strToU8('Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2026-01-01,Deleted,2001,x,,,,2026-01-01\n'),
    })
    const result = await importExport([new File([new Uint8Array(zip)], 'letterboxd-export.zip')])
    expect(result.added).toBe(3)
    expect((await listMedia('watch')).map((film) => film.title).sort()).toEqual(['Aftersun', 'Arrival', 'Past Lives'])
    // Hearted films get the heart; liked films that aren't here aren't added.
    expect((await listMedia('watch')).find((film) => film.title === 'Arrival')?.favorite).toBe(true)
    expect((await listMedia('watch')).find((film) => film.title === 'Past Lives')?.favorite).toBe(false)
  })

  it('hearts a film already here from the likes list, and a liked diary entry from the feed', async () => {
    await addMedia('watch', 'Arrival', 'done', '2026-11-01', { rating: 5 })
    expect(await mergeFilms({ watched: [], watchlist: [], liked: [{ title: 'Arrival', year: 2016 }] })).toEqual({ added: 0, updated: 1 })
    expect((await listMedia('watch'))[0].favorite).toBe(true)
    await mergeFilms({ watched: [{ title: 'Paterson', year: 2016, watched: '2026-10-01', rating: 5, liked: true }], watchlist: [] })
    expect((await listMedia('watch')).find((film) => film.title === 'Paterson')?.favorite).toBe(true)
  })
})

describe('adding with details', () => {
  it('a movie watched in the past keeps its dates and rating, and ticks that day', async () => {
    await addMedia('watch', 'Paterson', 'done', '2026-11-02', { started: '2026-09-12', finished: '2026-09-12', rating: 5 })
    expect((await listMedia('watch'))[0]).toMatchObject({ started: '2026-09-12', finished: '2026-09-12', rating: 5 })
    expect((await getDayValues('2026-09-12'))['tick:movie']).toBe(true)
    expect((await getDayValues('2026-11-02'))['tick:movie']).toBeUndefined()
  })

  it('a start after the finish is taken as the finish day', async () => {
    await addMedia('book', 'Piranesi', 'done', '2026-11-02', { started: '2026-10-20', finished: '2026-10-10' })
    expect((await listMedia('book'))[0]).toMatchObject({ started: '2026-10-10', finished: '2026-10-10' })
  })
})
