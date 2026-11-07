import { describe, expect, it } from 'vitest'
import type { Routine, Task, Track } from './db'
import { routineStatus } from './routines'
import { WEEK_TEMPLATE } from './setup'
import { buildUpcoming } from './upcoming'

// Monday 2 Nov 2026.
const today = '2026-11-02'

const routine = (id: string, name: string, intervalDays: number): Routine => ({ id, name, area: 'Cleaning', intervalDays, order: 0, updatedAt: 0 })
const log = (routineId: string, date: string) => ({ id: `${routineId}|${date}`, routineId, date, updatedAt: 0 })

function task(id: string, changes: Partial<Task>): Task {
  return { id, title: id, date: null, due: null, listId: 'life', parentId: null, done: false, doneDate: null, order: 0, updatedAt: 0, ...changes }
}

const track = (fields: Partial<Track> & Pick<Track, 'id' | 'name'>): Track => ({ start: '2026-11-02', weeks: 0, ongoing: true, weekdays: [], focus: [], order: 0, updatedAt: 0, ...fields })
const tech = track({ id: 'track-tech', name: 'Tech study', start: '2026-10-01', steps: true })
const step = { id: 's3', trackId: undefined, number: 3, block: 'A', title: 'Enums', subtopics: '', startNote: '', endNote: '', needsRevision: false, doneDate: null, updatedAt: 0 }
const base = { today, week: WEEK_TEMPLATE, routines: [], tasks: [], lists: [{ id: 'life', name: 'Life' }], tracks: [] as Track[], days: 7 }

describe('Upcoming', () => {
  it('leaves out what repeats every week: ongoing tracks, your own activities, the review (D87)', () => {
    const week = WEEK_TEMPLATE.map((day) => ({ ...day, activities: [{ id: 'g', part: 'evening' as const, text: 'Guitar', log: 'done' as const }] }))
    const upcoming = buildUpcoming({ ...base, week, tracks: [tech], steps: [step] })
    expect(upcoming.days.map((day) => day.label)).toEqual(['Today', 'Tomorrow', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    expect(upcoming.days.flatMap((day) => day.items)).toEqual([])
  })

  it('shows when a track starts, even an ongoing one', () => {
    const later = track({ id: 'piano', name: 'Piano', start: '2026-11-05' })
    expect(buildUpcoming({ ...base, tracks: [later] }).days[3].items).toEqual([expect.objectContaining({ title: 'Piano', detail: 'starts' })])
  })

  it('puts routines on the day they are next due, and late ones once at the top', () => {
    const vacuum = routine('vacuum', 'Vacuum', 7)
    const sheets = routine('sheets', 'Sheets', 14)
    const logs = [log('vacuum', '2026-10-31'), log('sheets', '2026-10-01')]
    const routines = [routineStatus(vacuum, logs, today), routineStatus(sheets, logs, today)]
    const upcoming = buildUpcoming({ ...base, routines })
    expect(upcoming.days[5].items).toEqual([expect.objectContaining({ title: 'Vacuum', kind: 'routine', detail: 'routine · Cleaning' })])
    expect(upcoming.late).toEqual([expect.objectContaining({ title: 'Sheets', detail: 'routine · 18 days late' })])
  })

  it('lists tasks by deadline and to-dos on their day, leaving out done ones and later ones', () => {
    const tasks = [
      task('Renew passport', { due: '2026-11-04' }),
      task('Call bank', { due: '2026-10-30' }),
      task('Far away', { due: '2026-12-01' }),
      task('Already done', { due: '2026-11-03', done: true, doneDate: '2026-11-01' }),
      task('Buy stamps', { listId: null, date: '2026-11-05' }),
      task('Old to-do', { listId: null, date: '2026-10-29' }),
    ]
    const upcoming = buildUpcoming({ ...base, week: [], tasks })
    expect(upcoming.days[2].items).toEqual([expect.objectContaining({ title: 'Renew passport', detail: 'Life' })])
    expect(upcoming.days[3].items).toEqual([expect.objectContaining({ title: 'Buy stamps', kind: 'to-do' })])
    expect(upcoming.days[0].items).toEqual([expect.objectContaining({ title: 'Old to-do' })])
    expect(upcoming.late).toEqual([expect.objectContaining({ title: 'Call bank', detail: 'Life · late since Fri 30 Oct' })])
    expect(upcoming.days.flatMap((day) => day.items).map((item) => item.title)).not.toContain('Far away')
  })

  it('looks 14 days ahead by default', () => {
    const upcoming = buildUpcoming({ ...base, days: undefined })
    expect(upcoming.days).toHaveLength(14)
    expect(upcoming.days[13].date).toBe('2026-11-15')
  })

  it('shows practice track days with their week and focus', () => {
    const tracks = [track({ id: 'driving', name: 'Driving practice', start: '2026-11-07', weeks: 4, ongoing: false, weekdays: [5], focus: ['Parking'] })]
    const week = WEEK_TEMPLATE.map((day) => ({ ...day, morning: 'free' as const, spanish: null }))
    const upcoming = buildUpcoming({ ...base, week, tracks })
    expect(upcoming.days[5].items).toEqual([expect.objectContaining({ title: 'Driving practice', detail: 'starts · Focus: Parking' })])
    // Its last day shows even without a session.
    const ending = buildUpcoming({ ...base, today: '2026-11-30', week, tracks })
    expect(ending.days.flatMap((day) => day.items)).toEqual([
      expect.objectContaining({ title: 'Driving practice', detail: 'last day' }),
    ])
  })
})
