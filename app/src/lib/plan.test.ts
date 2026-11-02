import { describe, expect, it } from 'vitest'
import { formatDate, plannerDate, weekdayIndex } from './dates'
import { buildDay, weekDates, type PlanItem } from './plan'

const at = (year: number, month: number, day: number, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute)
const ids = (items: PlanItem[]) => items.map((item) => item.id)
const find = (items: PlanItem[], id: string) => items.find((item) => item.id === id)

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
  it('Monday: meds, tech study and a 2-round strength session in week 1', () => {
    const plan = buildDay(at(2026, 11, 2))
    expect(plan.weekday).toBe('Monday')
    expect(ids(plan.morning)).toEqual(['med-empty', 'med-breakfast', 'study', 'workout'])
    expect(find(plan.morning, 'workout')?.label).toBe('Workout → strength, 2 rounds')
    expect(ids(plan.evening)).toEqual(['med-dinner'])
    expect(plan.foodRules).toBe(true)
  })

  it('Friday: drawing in the morning, revise/exercise as the Spanish floor', () => {
    const plan = buildDay(at(2026, 11, 6))
    expect(find(plan.morning, 'drawing-study')?.label).toBe('Drawing → Anatomy')
    expect(find(plan.anytime, 'spanish')?.label).toBe('Spanish: revise / exercise')
  })

  it('Saturday 7 Nov: weigh-in first, longer cardio, driving week 1', () => {
    const plan = buildDay(at(2026, 11, 7))
    expect(plan.morning[0].id).toBe('weigh-in')
    expect(find(plan.morning, 'workout')?.label).toBe('Workout → longer cardio, 30 min, easy')
    expect(find(plan.anytime, 'track:track-driving')?.label).toBe('Driving practice · week 1 of 4')
  })

  it('Sunday: weekly review, rest day, food rules off', () => {
    const plan = buildDay(at(2026, 11, 8))
    expect(ids(plan.morning)).toEqual(['med-empty', 'med-breakfast', 'review'])
    expect(find(plan.anytime, 'spanish')).toBeUndefined()
    expect(plan.foodRules).toBe(false)
  })

  it('cardio grows with the program weeks', () => {
    expect(find(buildDay(at(2026, 11, 24)).morning, 'workout')?.label).toBe('Workout → cardio, 35 min: 4 × (3 brisk, 2 easy)')
  })

  it("drawing shows the week's area with its exercises", () => {
    const item = find(buildDay(at(2026, 11, 13), { drawingArea: { name: 'Concept', exercises: ['Silhouettes'] } }).morning, 'drawing-study')
    expect(item).toMatchObject({ label: 'Drawing → Concept', steps: ['Silhouettes'], link: { href: '#/drawing' } })
    expect(find(buildDay(at(2026, 11, 13), { drawingArea: null }).morning, 'drawing-study')?.label).toBe('Drawing study')
  })

  it('stops driving practice after the 4 Saturdays', () => {
    expect(find(buildDay(at(2026, 11, 28)).anytime, 'track:track-driving')?.label).toBe('Driving practice · week 4 of 4')
    expect(find(buildDay(at(2026, 12, 5)).anytime, 'track:track-driving')).toBeUndefined()
  })
})

describe('practice tracks in the plan', () => {
  const swim = { id: 'swim', name: 'Swimming', start: '2026-11-02', weeks: 2, weekdays: [0, 3], focus: ['Floating'] }

  it('puts a track on its days only, while it runs', () => {
    expect(find(buildDay(at(2026, 11, 5), { tracks: [swim] }).anytime, 'track:swim')).toMatchObject({
      label: 'Swimming · week 1 of 2',
      detail: 'Focus: Floating',
    })
    expect(find(buildDay(at(2026, 11, 4), { tracks: [swim] }).anytime, 'track:swim')).toBeUndefined()
    expect(find(buildDay(at(2026, 11, 16), { tracks: [swim] }).anytime, 'track:swim')).toBeUndefined()
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
