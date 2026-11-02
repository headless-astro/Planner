import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { ensureSeeded, getDayValues } from './repo'
import { listTopics, setTopicDone, studyProgress, topicForDay } from './study'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded()
})

describe('tech study', () => {
  it('starts with the 37 topics from the plan, in blocks A to F', async () => {
    const topics = await listTopics()
    expect(topics).toHaveLength(37)
    expect(topics[0]).toMatchObject({ number: 1, block: 'A. C# language' })
    expect(topics[36]).toMatchObject({ number: 37, block: 'F. Interview practice' })
  })

  it('marks a topic done and ticks Study for that day, and undoes both', async () => {
    const [first] = await listTopics()
    await setTopicDone(first.id, '2026-11-02', true)
    expect((await getDayValues('2026-11-02'))['tick:study']).toBe(true)

    let topics = await listTopics()
    expect(topicForDay(topics, '2026-11-02')?.number).toBe(1)
    expect(topicForDay(topics, '2026-11-04')?.number).toBe(2)

    await setTopicDone(first.id, '2026-11-02', false)
    topics = await listTopics()
    expect(topicForDay(topics, '2026-11-02')?.number).toBe(1)
    expect((await getDayValues('2026-11-02'))['tick:study']).toBe(false)
  })

  it('works out the weeks left at two sessions a week', async () => {
    const progress = studyProgress(await listTopics(), '2026-11-02')
    expect(progress).toMatchObject({ done: 0, total: 37, weeksLeft: 19, finish: '2027-03-15' })
  })
})
