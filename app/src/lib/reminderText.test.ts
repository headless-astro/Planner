import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { reminderKind, reminderText } from './reminderText'
import { addTodo, ensureSeeded, setEntry, toggleTick } from './repo'

const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute)
const times = { morning: '12:00', night: '00:00' }

describe('which reminder a ping is', () => {
  it('is the one whose time is nearest', () => {
    expect(reminderKind(times, at(2, 12, 3))).toBe('morning')
    expect(reminderKind(times, at(2, 23, 58))).toBe('night')
    expect(reminderKind(times, at(3, 0, 20))).toBe('night')
  })
})

describe('the reminder text', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await ensureSeeded()
  })

  it("lists Monday's plan in the morning, leaving out what's done", async () => {
    expect(await reminderText('morning', at(2, 12))).toEqual({
      title: 'Your day',
      body: 'Meds ×3 · Tech study → #1 Revision: value vs reference, structs vs classes, properties · Workout → strength, 2 rounds',
    })
    await toggleTick('2026-11-02', 'med-empty')
    await toggleTick('2026-11-02', 'workout')
    await addTodo('Call the bank', '2026-11-02')
    expect((await reminderText('morning', at(2, 12))).body).toBe('Meds ×2 · Tech study → #1 Revision: value vs reference, structs vs classes, properties · 1 to-do')
  })

  it("at midnight, lists what's left to close the day before (the day ends at 06:00)", async () => {
    expect(await reminderText('night', at(3, 0))).toEqual({
      title: 'Closing the day',
      body: 'Meds · with dinner · Food rules: kept or slip? · Rate your work',
    })
    await toggleTick('2026-11-02', 'med-dinner')
    await setEntry('2026-11-02', 'rules', 'kept')
    await setEntry('2026-11-02', 'work', '2')
    expect((await reminderText('night', at(3, 0))).body).toBe('All done for today. Sleep well.')
  })
})
