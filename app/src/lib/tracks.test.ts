import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { ensureSeeded } from './repo'
import { getDaySessions, listSessions, listTracks, saveSession, setSession, trackEnd } from './tracks'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded()
})

describe('practice tracks', () => {
  it('starts with the driving month on Saturdays', async () => {
    expect(await listTracks()).toMatchObject([{ name: 'Driving practice', start: '2026-11-07', weeks: 4, weekdays: [5] }])
  })

  it('logs a session with details, and removes it', async () => {
    await setSession('track-driving', '2026-11-07', true)
    await saveSession('track-driving', '2026-11-07', { minutes: 45, practiced: 'parking' })
    expect((await getDaySessions('2026-11-07'))['track-driving']).toMatchObject({ minutes: 45, practiced: 'parking', feeling: '' })

    await setSession('track-driving', '2026-11-07', false)
    expect(await getDaySessions('2026-11-07')).toEqual({})
  })

  it('takes extra sessions on other days', async () => {
    await saveSession('track-driving', '2026-11-10', { minutes: 20 })
    expect((await listSessions()).map((session) => session.date)).toEqual(['2026-11-10'])
  })

  it('knows its last day', () => {
    expect(trackEnd({ start: '2026-11-07', weeks: 4 })).toBe('2026-12-04')
  })
})
