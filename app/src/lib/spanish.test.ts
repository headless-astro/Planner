import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { ensureSeeded, getDayValues } from './repo'
import {
  addSpanishLog,
  bookState,
  dsProgress,
  getSpanishSettings,
  listSpanishLogs,
  nextBookSession,
  saveDayLog,
  setBookSession,
  videoMinutes,
} from './spanish'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded()
})

const nextSession = async () => {
  const settings = await getSpanishSettings()
  return nextBookSession(bookState(await listSpanishLogs(), settings), settings)
}

describe('the Spanish book', () => {
  it('does 2 review sessions, then carries on from unit 3 (D38, D43)', async () => {
    expect(await nextSession()).toBe('review session 1 of 2')
    await setBookSession('2026-11-03', true)
    expect(await nextSession()).toBe('review session 2 of 2')
    await setBookSession('2026-11-05', true)
    expect(await nextSession()).toBe('unit 3')
    await setBookSession('2026-11-10', true)
    expect(await nextSession()).toBe('unit 4')
    expect((await getDayValues('2026-11-10'))['tick:spanish-book']).toBe(true)
  })

  it('takes a session back when it is unticked', async () => {
    await setBookSession('2026-11-03', true)
    await setBookSession('2026-11-03', false)
    expect(await nextSession()).toBe('review session 1 of 2')
    expect((await getDayValues('2026-11-03'))['tick:spanish-book']).toBe(false)
  })
})

describe('Dreaming Spanish input', () => {
  it('adds up minutes from Today and from the Spanish screen', async () => {
    await saveDayLog('2026-11-02', 'video', { minutes: 20 })
    await saveDayLog('2026-11-02', 'video', { minutes: 25 })
    await addSpanishLog('2026-11-03', 'video', { minutes: 15, title: 'Una tarde' })
    expect(videoMinutes(await listSpanishLogs())).toBe(40)
    expect((await getDayValues('2026-11-03'))['tick:spanish']).toBe(true)
  })

  it('shows the level markers as markers (D37)', () => {
    expect(dsProgress(0)).toMatchObject({ level: 1, nextLevel: 2, hoursToNext: 50 })
    expect(dsProgress(60 * 60)).toMatchObject({ level: 2, nextLevel: 3, hoursToNext: 90 })
    expect(dsProgress(1600 * 60)).toMatchObject({ level: 7, nextLevel: null, hoursToNext: null })
  })
})
