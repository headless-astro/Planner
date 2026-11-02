import { beforeEach, describe, expect, it } from 'vitest'
import { db, type DrawingArea, type DrawingLog } from './db'
import { deleteDrawingLog, drawingAreaFor, listDrawingAreas, listDrawingLogs, saveDrawingLog, setDrawingSession, textLines } from './drawing'
import { linkParts } from './links'
import { ensureSeeded, getDayValues } from './repo'

const area = (id: string, order: number): DrawingArea => ({ id, name: id, exercises: [], sources: [], order, updatedAt: 0 })
const log = (date: string, areaId: string): DrawingLog => ({ id: `${date}|drawing`, date, areaId, exercise: '', minutes: null, note: '', updatedAt: 0 })
const areas = [area('a', 0), area('b', 1), area('c', 2)]

describe("the drawing area for a day (Fridays 6, 13 and 20 Nov)", () => {
  it('starts with the first area', () => {
    expect(drawingAreaFor(areas, [], '2026-11-06')?.id).toBe('a')
  })

  it('moves on after a week you drew in', () => {
    expect(drawingAreaFor(areas, [log('2026-11-06', 'a')], '2026-11-13')?.id).toBe('b')
  })

  it("doesn't skip an area after a missed week", () => {
    expect(drawingAreaFor(areas, [log('2026-11-06', 'a')], '2026-11-20')?.id).toBe('b')
  })

  it('keeps the area logged that day, and wraps around after the last one', () => {
    expect(drawingAreaFor(areas, [log('2026-11-06', 'c')], '2026-11-06')?.id).toBe('c')
    expect(drawingAreaFor(areas, [log('2026-11-06', 'c')], '2026-11-13')?.id).toBe('a')
  })

  it('has nothing to show without areas', () => {
    expect(drawingAreaFor([], [], '2026-11-06')).toBeNull()
  })
})

describe('drawing sessions', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureSeeded()
  })

  it('starts with the five areas from the plan, each with exercises', async () => {
    const list = await listDrawingAreas()
    expect(list.map((item) => item.name)).toEqual(['Anatomy', 'Gesture & movement', 'Dynamic composition', 'Light & values', 'Concept'])
    expect(list.every((item) => item.exercises.length > 0)).toBe(true)
  })

  it("ticking Friday's slot logs a session, and unticking removes it", async () => {
    await setDrawingSession('2026-11-06', true, 'drawing-anatomy')
    expect(await listDrawingLogs()).toMatchObject([{ date: '2026-11-06', areaId: 'drawing-anatomy' }])
    expect((await getDayValues('2026-11-06'))['tick:drawing-study']).toBe(true)
    await setDrawingSession('2026-11-06', false, null)
    expect(await listDrawingLogs()).toEqual([])
    expect((await getDayValues('2026-11-06'))['tick:drawing-study']).toBe(false)
  })

  it('a session logged from the drawing screen keeps its details and counts for the day', async () => {
    await saveDrawingLog('2026-11-03', { areaId: 'drawing-concept', exercise: 'Silhouettes', minutes: 20 })
    await saveDrawingLog('2026-11-03', { note: 'fun' })
    expect(await listDrawingLogs()).toMatchObject([{ areaId: 'drawing-concept', exercise: 'Silhouettes', minutes: 20, note: 'fun' }])
    expect((await getDayValues('2026-11-03'))['tick:drawing-study']).toBe(true)
    await deleteDrawingLog('2026-11-03')
    expect(await listDrawingLogs()).toEqual([])
  })
})

describe('text helpers', () => {
  it('turns a text box into lines', () => {
    expect(textLines(' one \n\n two\n')).toEqual(['one', 'two'])
  })

  it('finds web links in a line, leaving the full stop out', () => {
    expect(linkParts('Lessons: https://drawabox.com.')).toEqual([
      { text: 'Lessons: ', href: null },
      { text: 'https://drawabox.com', href: 'https://drawabox.com' },
      { text: '.', href: null },
    ])
    expect(linkParts('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)', href: null }])
  })
})
