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
  saveBookSession,
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

  it('keeps what you did with the session, and follows the unit you logged', async () => {
    await saveBookSession('2026-11-03', { unit: 3, notes: 'Reading and exercises 1–4, plus a worksheet on ser and estar' })
    await saveBookSession('2026-11-05', { unit: 3, notes: 'Finished unit 3' })
    expect(await nextSession()).toBe('review session 1 of 2')
    const logs = await listSpanishLogs()
    expect(logs.find((log) => log.date === '2026-11-03')).toMatchObject({ kind: 'book', unit: 3, notes: expect.stringContaining('ser and estar') })
    expect(bookState(logs, await getSpanishSettings())).toMatchObject({ nextUnit: 4, unitsDone: 1 })
    expect((await getDayValues('2026-11-05'))['tick:spanish-book']).toBe(true)
  })

  it('brings back the notes when a session is ticked again the same day', async () => {
    await saveBookSession('2026-11-03', { notes: 'Unit review' })
    await setBookSession('2026-11-03', false)
    await setBookSession('2026-11-03', true)
    expect((await listSpanishLogs())[0].notes).toBe('Unit review')
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

  it('logs exercises with what you did, and they count as Spanish for the day', async () => {
    await addSpanishLog('2026-11-06', 'exercise', { title: 'Practice site', notes: 'Past tense, 2 sets' })
    await saveDayLog('2026-11-06', 'exercise', { notes: 'Plus flashcards' })
    const logs = await listSpanishLogs()
    expect(logs.map((log) => log.notes).sort()).toEqual(['Past tense, 2 sets', 'Plus flashcards'])
    expect(videoMinutes(logs)).toBe(0)
    expect((await getDayValues('2026-11-06'))['tick:spanish']).toBe(true)
  })

  it('shows the level markers as markers (D37)', () => {
    expect(dsProgress(0)).toMatchObject({ level: 1, nextLevel: 2, hoursToNext: 50 })
    expect(dsProgress(60 * 60)).toMatchObject({ level: 2, nextLevel: 3, hoursToNext: 90 })
    expect(dsProgress(1600 * 60)).toMatchObject({ level: 7, nextLevel: null, hoursToNext: null })
  })
})
