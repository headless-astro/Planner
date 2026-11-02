import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addMedia, finishMedia, finishedIn, groupMedia, listMedia, startMedia } from './media'
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
})
