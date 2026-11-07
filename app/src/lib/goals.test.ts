import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addGoal, deleteGoal, getGoalProgress, goalPercent, goalTree, listGoals, moveGoal } from './goals'
import { addMedia } from './media'
import { ensureSeeded, setEntry, setMeasurement, toggleTick } from './repo'
import { DRAWING_TRACK, SPANISH_TRACK } from './activities'
import { migrateToTracks } from './migrateTracks'
import { saveSession, updateStep } from './tracks'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded()
})

const titles = async () => goalTree(await listGoals()).map((branch) => [branch.goal.title, ...branch.children.map((child) => `- ${child.title}`)])

describe('goals', () => {
  it('start with the goal tree from the spreadsheet', async () => {
    expect(await titles()).toEqual([
      ['Improve health', '- Weight loss', '- Getting fit', '- Better eating habits'],
      ['Improve technical drawing skills'],
      ['Improve technical knowledge'],
      ['Learn Spanish'],
    ])
  })

  it('can be added, moved and deleted with their sub-goals', async () => {
    await addGoal('Wake up earlier', null)
    await addGoal('Up by 10:00', (await listGoals()).find((goal) => goal.title === 'Wake up earlier')?.id ?? null)
    await moveGoal('goal-fitness', -1)
    await moveGoal('goal-health', -1)
    await moveGoal('goal-spanish', 1)
    await deleteGoal('goal-tech')
    expect(await titles()).toEqual([
      ['Improve health', '- Getting fit', '- Weight loss', '- Better eating habits'],
      ['Improve technical drawing skills'],
      ['Wake up earlier', '- Up by 10:00'],
      ['Learn Spanish'],
    ])
  })

  it('fill their progress lines from what you log', async () => {
    await setMeasurement('2026-11-07', 'weight', 80)
    await setMeasurement('2026-11-21', 'weight', 79)
    await toggleTick('2026-11-20', 'workout')
    await setEntry('2026-11-20', 'rules', 'kept')
    await setEntry('2026-11-19', 'rules', 'slip')
    await migrateToTracks()
    await updateStep('topic-1', { doneDate: '2026-11-02' })
    await saveSession(SPANISH_TRACK, '2026-11-03', { minutes: 90 }, 'spanish-video')
    await saveSession(DRAWING_TRACK, '2026-11-06', { focus: 'Anatomy' }, 'drawing')
    await addMedia('book', 'Dune', 'done', '2026-11-15')

    const progress = await getGoalProgress('2026-11-21')
    expect(progress.weight).toMatchObject({ value: '79.0 kg', text: 'Down 1.0 kg since Sat 7 Nov · goal pace: down 0.8 kg', amount: 79, start: 80 })
    expect(progress.fitness).toMatchObject({ value: '1 workout', text: 'in the last 4 weeks', amount: 1 })
    expect(progress['food-rules']).toMatchObject({ value: '1 day', amount: 1 })
    // Goals from before follow the tracks these became (D83).
    expect(progress.drawing).toMatchObject({ value: '1 day', text: 'in the last 4 weeks · this week: Gesture & movement' })
    expect(progress.study).toMatchObject({ value: '1 of 37', text: 'steps done' })
    expect(progress.spanish).toMatchObject({ value: '1.5 h', text: '48.5 h to Level 2' })
    expect(progress[`track:${SPANISH_TRACK}`]).toEqual(progress.spanish)
    expect(progress.reading).toMatchObject({ value: '1 book', text: 'finished in 2026 · read on 1 day in the last 4 weeks' })

    // A target turns the headline into a bar: weight runs from where it started to the target.
    expect(goalPercent(76, progress.weight)).toBe(25)
    expect(goalPercent(4, progress.fitness)).toBe(25)
    expect(goalPercent(null, progress.fitness)).toBeNull()
  })

  it('say when there is nothing yet', async () => {
    const progress = await getGoalProgress('2026-11-02')
    expect(progress.weight?.text).toBe('No weigh-ins yet. They go in on Saturdays, on Today.')
    expect(progress.fitness).toMatchObject({ value: '0 workouts', amount: 0 })
    expect(progress.weight?.amount).toBeNull()
  })
})
