import { beforeEach, describe, expect, it } from 'vitest'
import { db, type TrackSession } from './db'
import { ensureSeeded, getDayValues } from './repo'
import { addTrack, focusFor, isRunning, listSessions, listTracks, milestoneProgress, saveSession, sessionFor, setActivityDone, setSession, stepForDay, trackEnd, trackStatus, updateTrack } from './tracks'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded()
})

const session = (date: string, focus?: string): TrackSession => ({ id: date, trackId: 't', date, minutes: null, practiced: '', feeling: '', updatedAt: 1, ...(focus ? { focus } : {}) })

describe('tracks', () => {
  it('starts with the driving month on Saturdays', async () => {
    expect(await listTracks()).toMatchObject([{ name: 'Driving practice', start: '2026-11-07', weeks: 4, weekdays: [5] }])
  })

  it("logs a session for an activity with details, and removes it; older sessions count for any", async () => {
    await setSession('track-driving', '2026-11-07', true, 'sat')
    await saveSession('track-driving', '2026-11-07', { minutes: 45, practiced: 'parking' }, 'sat')
    expect(sessionFor(await listSessions(), 'track-driving', '2026-11-07', 'sat')).toMatchObject({ minutes: 45, practiced: 'parking', feeling: '' })
    await setSession('track-driving', '2026-11-07', false, 'sat')
    expect(await listSessions()).toEqual([])

    await saveSession('track-driving', '2026-11-14', {})
    expect(sessionFor(await listSessions(), 'track-driving', '2026-11-14', 'any-activity')).toBeTruthy()
  })

  it('runs for its weeks, or keeps going', () => {
    expect(trackEnd({ start: '2026-11-07', weeks: 4 })).toBe('2026-12-04')
    expect(isRunning({ start: '2026-11-07', weeks: 4 }, '2026-12-05')).toBe(false)
    expect(isRunning({ start: '2026-11-07', weeks: 0, ongoing: true }, '2027-06-01')).toBe(true)
    expect(trackStatus({ start: '2026-11-02', weeks: 0, ongoing: true }, '2026-11-20').text).toBe('Week 3')
    expect(trackStatus({ start: '2026-11-07', weeks: 4 }, '2026-11-15').text).toBe('Week 2 of 4')
  })

  it('goes through a fixed focus week by week', () => {
    const fixed = { start: '2026-11-07', focus: ['Parking', 'Roundabouts'], loop: false }
    expect(focusFor(fixed, [], '2026-11-07')?.name).toBe('Parking')
    expect(focusFor(fixed, [], '2026-11-15')?.name).toBe('Roundabouts')
    expect(focusFor(fixed, [], '2026-11-21')).toBeNull()
  })

  it('loops a focus, moving on only after a week with a session (rule 4)', () => {
    const loop = { start: '2026-11-02', focus: ['Anatomy', 'Concept', 'Perspective'], loop: true, focusNotes: ['Gesture', '', ''] }
    expect(focusFor(loop, [], '2026-11-06')).toEqual({ index: 0, name: 'Anatomy', notes: 'Gesture' })
    // A week without drawing keeps the same focus; after a week with it, the next one.
    expect(focusFor(loop, [], '2026-11-13')?.name).toBe('Anatomy')
    expect(focusFor(loop, [session('2026-11-06', 'Anatomy')], '2026-11-13')?.name).toBe('Concept')
    expect(focusFor(loop, [session('2026-11-20', 'Perspective')], '2026-11-27')?.name).toBe('Anatomy')
  })

  it('takes the next step not done, or the one done that day', () => {
    const steps = [
      { id: 'a', number: 1, title: 'A', doneDate: '2026-11-02' },
      { id: 'b', number: 2, title: 'B', doneDate: null },
    ] as never[]
    expect(stepForDay(steps, '2026-11-02')).toMatchObject({ id: 'a' })
    expect(stepForDay(steps, '2026-11-04')).toMatchObject({ id: 'b' })
  })

  it('adds up hours toward milestones', () => {
    expect(milestoneProgress(60, [{ name: 'Level 3', hours: 150 }, { name: 'Level 2', hours: 50 }])).toEqual({
      hours: 60,
      reached: 'Level 2',
      next: { name: 'Level 3', hours: 150 },
      hoursToNext: 90,
    })
  })

  it('ticking an activity marks the step done and ticks the habit it counts for', async () => {
    const id = await addTrack({ name: 'Guitar', start: '2026-11-01', weeks: 0, ongoing: true, steps: true })
    await updateTrack(id, { habitId: 'crafts' })
    await db.topics.put({ id: 'g1', trackId: id, number: 1, block: '', title: 'Chords', subtopics: '', startNote: '', endNote: '', needsRevision: false, doneDate: null, updatedAt: 1 })
    const track = (await listTracks()).find((candidate) => candidate.id === id)
    if (!track) throw new Error('no track')
    const steps = [await db.topics.get('g1')] as never[]
    await setActivityDone(track, { id: 'mon', log: 'step' }, '2026-11-02', true, { steps, sessions: [] })
    expect((await db.topics.get('g1'))?.doneDate).toBe('2026-11-02')
    expect(sessionFor(await listSessions(), id, '2026-11-02', 'mon')).toMatchObject({ stepId: 'g1' })
    expect((await getDayValues('2026-11-02'))['tick:crafts']).toBe(true)

    await setActivityDone(track, { id: 'mon', log: 'step' }, '2026-11-02', false, { steps: [await db.topics.get('g1')] as never[], sessions: [] })
    expect((await db.topics.get('g1'))?.doneDate).toBeNull()
  })
})
