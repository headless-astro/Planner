import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { saveDrawingLog } from './drawing'
import { addGoal, deleteGoal, getGoalProgress, goalTree, listGoals, moveGoal } from './goals'
import { addMedia } from './media'
import { ensureSeeded, setEntry, setMeasurement, toggleTick } from './repo'
import { addSpanishLog } from './spanish'
import { setTopicDone } from './study'

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
    await setTopicDone('topic-1', '2026-11-02', true)
    await addSpanishLog('2026-11-03', 'video', { minutes: 90 })
    await saveDrawingLog('2026-11-06', { areaId: 'drawing-anatomy' })
    await addMedia('book', 'Dune', 'done', '2026-11-15')

    const progress = await getGoalProgress('2026-11-21')
    expect(progress.weight.text).toBe('Down 1.0 kg since Sat 7 Nov · goal pace: down 0.8 kg')
    expect(progress.fitness.text).toBe('1 workout in the last 4 weeks')
    expect(progress['food-rules'].text).toBe('Food rules kept on 1 day in the last 4 weeks')
    expect(progress.drawing.text).toBe('1 drawing day in the last 4 weeks · this week: Gesture & movement')
    expect(progress.study.text).toBe('1 of 37 tech topics done')
    expect(progress.spanish.text).toBe('1.5 h of Dreaming Spanish · level 1, 48.5 h to level 2')
    expect(progress.reading.text).toBe('1 book finished in 2026 · read on 1 day in the last 4 weeks')
  })

  it('say when there is nothing yet', async () => {
    const progress = await getGoalProgress('2026-11-02')
    expect(progress.weight.text).toBe('No weigh-ins yet. They go in on Saturdays, on Today.')
    expect(progress.fitness.text).toBe('0 workouts in the last 4 weeks')
  })
})
