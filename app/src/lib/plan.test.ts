import { describe, expect, it } from 'vitest'
import { DRAWING_TRACK, SPANISH_TRACK, TECH_TRACK } from './activities'
import { formatDate, plannerDate, weekdayIndex } from './dates'
import type { Topic, Track } from './db'
import { buildDay, weekDates, type PlanItem } from './plan'

const at = (year: number, month: number, day: number, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute)
const ids = (items: PlanItem[]) => items.map((item) => item.id)
const find = (items: PlanItem[], id: string) => items.find((item) => item.id === id)

const track = (fields: Partial<Track> & Pick<Track, 'id' | 'name'>): Track => ({ start: '2026-11-02', weeks: 0, ongoing: true, weekdays: [], focus: [], order: 0, updatedAt: 0, ...fields })
const step = (id: string, trackId: string | undefined, number: number, title: string, doneDate: string | null = null): Topic => ({
  id,
  ...(trackId ? { trackId } : {}),
  number,
  block: 'A',
  title,
  subtopics: '',
  startNote: '',
  endNote: '',
  needsRevision: false,
  doneDate,
  updatedAt: 0,
})

// Tech study, Spanish, drawing and driving as tracks (D83–D85), with the starting week's slots.
const tracks: Track[] = [
  track({ id: TECH_TRACK, name: 'Tech study', steps: true }),
  track({ id: SPANISH_TRACK, name: 'Spanish', steps: true, milestones: [{ name: 'Level 2', hours: 50 }] }),
  track({ id: DRAWING_TRACK, name: 'Drawing', loop: true, focus: ['Anatomy', 'Concept'], focusNotes: ['Exercise: Gesture', ''] }),
  track({ id: 'track-driving', name: 'Driving practice', start: '2026-11-07', weeks: 4, ongoing: false, weekdays: [5], focus: ['Car controls'] }),
]
const steps: Topic[] = [step('t1', undefined, 1, 'Value vs reference'), step('t2', undefined, 2, 'Enums'), step('s1', SPANISH_TRACK, 1, 'Review session 1')]
const setup = { tracks, steps, sessions: [] }

describe('plannerDate', () => {
  it('keeps the previous day until 06:00', () => {
    expect(formatDate(plannerDate(at(2026, 11, 3, 5, 59)))).toBe('02/11/2026')
    expect(formatDate(plannerDate(at(2026, 11, 3, 6, 0)))).toBe('03/11/2026')
  })
})

describe('weekdayIndex', () => {
  it('starts the week on Monday', () => {
    expect(weekdayIndex(at(2026, 11, 2))).toBe(0)
    expect(weekdayIndex(at(2026, 11, 8))).toBe(6)
  })
})

describe('buildDay', () => {
  it('Monday: meds, tech study with its next step, and a 2-round strength session in week 1', () => {
    const plan = buildDay(at(2026, 11, 2), setup)
    expect(plan.weekday).toBe('Monday')
    expect(ids(plan.morning)).toEqual(['med-empty', 'med-breakfast', 'act:tech', 'workout'])
    expect(find(plan.morning, 'act:tech')).toMatchObject({ label: 'Tech study → Value vs reference', trackId: TECH_TRACK, link: { href: '#/step/t1' } })
    expect(find(plan.morning, 'workout')?.label).toBe('Workout → strength, 2 rounds')
    expect(find(plan.anytime, 'act:spanish-video')).toMatchObject({ label: 'Spanish · 1 video', input: 'minutes' })
    expect(ids(plan.evening)).toEqual(['med-dinner'])
    expect(plan.foodRules).toBe(true)
  })

  it('Tuesday: the Spanish book is the next step of the Spanish track', () => {
    expect(find(buildDay(at(2026, 11, 3), setup).morning, 'act:spanish-book')?.label).toBe('Spanish · Book → Review session 1')
  })

  it("Friday: drawing with the week's focus and its notes, exercises as Spanish", () => {
    const plan = buildDay(at(2026, 11, 6), setup)
    expect(find(plan.morning, 'act:drawing')).toMatchObject({ label: 'Drawing', detail: 'Focus: Anatomy', steps: ['Exercise: Gesture'] })
    expect(find(plan.anytime, 'act:spanish-exercise')?.label).toBe('Spanish · Revise or exercises')
  })

  it('Saturday 7 Nov: weigh-in first, longer cardio, driving week 1', () => {
    const plan = buildDay(at(2026, 11, 7), setup)
    expect(plan.morning[0].id).toBe('weigh-in')
    expect(find(plan.morning, 'workout')?.label).toBe('Workout → longer cardio, 30 min, easy')
    expect(find(plan.anytime, 'act:track-track-driving')).toMatchObject({ label: 'Driving practice', detail: 'week 1 of 4 · Focus: Car controls' })
  })

  it('Sunday: weekly review, rest day, food rules off', () => {
    const plan = buildDay(at(2026, 11, 8), setup)
    expect(ids(plan.morning)).toEqual(['med-empty', 'med-breakfast', 'review'])
    expect(plan.anytime.filter((item) => item.trackId === SPANISH_TRACK)).toEqual([])
    expect(plan.foodRules).toBe(false)
  })

  it('cardio grows with the program weeks', () => {
    expect(find(buildDay(at(2026, 11, 24), setup).morning, 'workout')?.label).toBe('Workout → cardio, 35 min: 4 × (3 brisk, 2 easy)')
  })

  it('stops a track after its last week', () => {
    expect(find(buildDay(at(2026, 11, 28), setup).anytime, 'act:track-track-driving')?.detail).toContain('week 4 of 4')
    expect(find(buildDay(at(2026, 12, 5), setup).anytime, 'act:track-track-driving')).toBeUndefined()
  })
})

describe('the week of activities (F70)', () => {
  it('puts each activity in its part of the day, tracks and your own', () => {
    const week = Array.from({ length: 7 }, () => ({
      morning: 'free' as const,
      workout: 'rest' as const,
      spanish: null,
      foodRules: false,
      weighIn: false,
      activities: [
        { id: 'g', part: 'evening' as const, text: 'Guitar', note: '20 min', log: 'done' as const },
        { id: 'd', part: 'morning' as const, trackId: DRAWING_TRACK, log: 'done' as const },
      ],
    }))
    const plan = buildDay(at(2026, 11, 4), { ...setup, week, doses: [] })
    expect(ids(plan.morning)).toEqual(['act:d'])
    expect(plan.evening).toEqual([expect.objectContaining({ id: 'act:g', label: 'Guitar · 20 min', tickKey: 'act:guitar' })])
  })

  it('leaves out a track that was deleted', () => {
    const week = [{ morning: 'free' as const, workout: 'rest' as const, spanish: null, foodRules: false, weighIn: false, activities: [{ id: 'x', part: 'morning' as const, trackId: 'gone', log: 'done' as const }] }]
    expect(buildDay(at(2026, 11, 2), { ...setup, week, doses: [] }).morning).toEqual([])
  })
})

describe('weekDates', () => {
  it('returns Monday to Sunday of the given week', () => {
    const days = weekDates(at(2026, 11, 4)).map(formatDate)
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('02/11/2026')
    expect(days[6]).toBe('08/11/2026')
  })
})
