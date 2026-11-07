import { beforeEach, describe, expect, it } from 'vitest'
import { DRAWING_TRACK, SPANISH_TRACK, TECH_TRACK } from './activities'
import { DIRTY, db } from './db'
import { migrateToTracks } from './migrateTracks'
import { ensureSeeded, setEntry } from './repo'
import { hoursOf, listSessions, listTracks, stepsOf, updateTrack } from './tracks'
import { alive } from './store'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded()
})

const log = (id: string, date: string, kind: 'video' | 'book' | 'reading' | 'exercise', fields: object = {}) =>
  db.spanishLogs.put({ id, date, kind, minutes: null, unit: null, pages: null, title: '', notes: '', updatedAt: 5, ...fields })

describe('tech study, Spanish and drawing become tracks (D83–D85)', () => {
  it('carries over every step, session, hour and note', async () => {
    // Tech study: topic 1 done on 2 Nov.
    const [first] = alive(await db.topics.toArray()).sort((a, b) => a.number - b.number)
    await db.topics.update(first.id, { doneDate: '2026-11-02', updatedAt: 5 })
    // Spanish: a review session, video twice on one day, reading, and a day only ticked on Today.
    await log('b1', '2026-11-03', 'book', { notes: 'Ser vs estar' })
    await log('v1', '2026-11-04', 'video', { minutes: 30 })
    await log('v2', '2026-11-04', 'video', { minutes: 15, title: 'Cooking' })
    await log('r1', '2026-11-07', 'reading', { pages: 6 })
    await setEntry('2026-11-05', 'tick:spanish', true)
    // Drawing: a session on the first area.
    const [area] = alive(await db.drawingAreas.toArray()).sort((a, b) => a.order - b.order)
    await db.drawingLogs.put({ id: '2026-11-06|drawing', date: '2026-11-06', areaId: area.id, exercise: 'Gesture', minutes: 25, note: 'loose', updatedAt: 5 })

    await migrateToTracks()
    const tracks = await listTracks()
    expect(tracks.slice(0, 3).map((track) => track.id)).toEqual([TECH_TRACK, SPANISH_TRACK, DRAWING_TRACK])
    expect(tracks.find((track) => track.id === SPANISH_TRACK)).toMatchObject({ ongoing: true, steps: true, milestones: expect.arrayContaining([{ name: 'Level 2', hours: 50 }]) })
    expect(tracks.find((track) => track.id === DRAWING_TRACK)).toMatchObject({ loop: true, habitId: 'drawing', focus: expect.arrayContaining([area.name]) })

    const sessions = await listSessions()
    const of = (trackId: string) => sessions.filter((session) => session.trackId === trackId)
    expect(of(TECH_TRACK)).toEqual([expect.objectContaining({ date: '2026-11-02', stepId: first.id })])
    expect(hoursOf(of(SPANISH_TRACK))).toBe(0.75)
    expect(of(SPANISH_TRACK).map((session) => session.date).sort()).toEqual(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-07'])
    expect(of(SPANISH_TRACK).find((session) => session.date === '2026-11-07')).toMatchObject({ pages: 6, activityId: 'spanish-reading' })
    expect(of(DRAWING_TRACK)).toEqual([expect.objectContaining({ focus: area.name, minutes: 25, practiced: 'Gesture: loose' })])

    const spanishSteps = stepsOf(SPANISH_TRACK, alive(await db.topics.toArray()))
    expect(spanishSteps[0]).toMatchObject({ title: 'Review session 1', doneDate: '2026-11-03', endNote: 'Ser vs estar' })
    expect(spanishSteps[2]).toMatchObject({ title: 'Unit 3', doneDate: null })
    // Tech study's topics are its steps, untouched.
    expect(stepsOf(TECH_TRACK, alive(await db.topics.toArray()))).toHaveLength(37)
  })

  it('makes the same records on every device, sends none of them, and never doubles or overwrites', async () => {
    await migrateToTracks()
    expect(await db.tracks.where(DIRTY).equals(1).count()).toBe(0)
    expect(await db.trackSessions.where(DIRTY).equals(1).count()).toBe(0)

    await updateTrack(SPANISH_TRACK, { name: 'Español' })
    const before = await db.tracks.count()
    await migrateToTracks()
    expect(await db.tracks.count()).toBe(before)
    expect((await db.tracks.get(SPANISH_TRACK))?.name).toBe('Español')
  })

  it('makes nothing for someone who never had these', async () => {
    await db.delete()
    await db.open()
    await migrateToTracks(false)
    expect(await db.tracks.count()).toBe(0)
  })
})
