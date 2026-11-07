import { describe, expect, it } from 'vitest'
import { parseDate } from './dates'
import { DEFAULT_EXERCISE, blockNow, blockText } from './exercise'

const plan = { ...DEFAULT_EXERCISE, active: 'easy' as const, start: '2026-11-02' }

describe('exercise blocks', () => {
  it('counts weeks from the day the block started, and loops after week 4', () => {
    expect(blockNow(plan, parseDate('2026-11-01')).week).toBeNull()
    expect(blockNow(plan, parseDate('2026-11-02'))).toMatchObject({ week: 1, round: 1 })
    expect(blockNow(plan, parseDate('2026-11-29'))).toMatchObject({ week: 4, round: 1 })
    expect(blockNow(plan, parseDate('2026-11-30'))).toMatchObject({ week: 1, round: 2 })
    expect(blockNow(plan, parseDate('2026-11-30')).block.name).toBe('Easy')
  })

  it('says where the block is', () => {
    expect(blockText(plan, '2026-11-10')).toBe('Easy · week 2 of 4')
    expect(blockText(plan, '2026-12-01')).toBe('Easy · week 1 of 4, second time through')
    expect(blockText(plan, '2026-10-30')).toBe('Easy starts Mon 2 Nov')
  })

  it('suggests 4 weeks of everything for each block', () => {
    for (const block of Object.values(DEFAULT_EXERCISE.blocks)) {
      expect(block.rounds).toHaveLength(4)
      expect(block.cardio).toHaveLength(4)
      expect(block.longCardio).toHaveLength(4)
      for (const move of block.moves) expect(move.reps).toHaveLength(4)
    }
  })
})
