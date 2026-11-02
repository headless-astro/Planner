import { beforeEach, describe, expect, it } from 'vitest'
import { exportBackup, importBackup } from './backup'
import { db } from './db'
import { ensureSeeded, getDayValues, listDoses, setEntry } from './repo'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('backup', () => {
  it('restores everything on a fresh device', async () => {
    await ensureSeeded()
    await setEntry('2026-11-02', 'work', '2')
    const file = JSON.stringify(await exportBackup())

    await db.delete()
    await db.open()
    const result = await importBackup(JSON.parse(file))

    expect(result.added).toBeGreaterThan(0)
    expect((await getDayValues('2026-11-02')).work).toBe('2')
    expect(await listDoses()).toHaveLength(4)
  })

  it('keeps newer changes on this device', async () => {
    await db.entries.put({ id: '2026-11-02|work', date: '2026-11-02', key: 'work', value: '3', updatedAt: 200 })
    const result = await importBackup({
      app: 'planner',
      version: 1,
      exportedAt: '',
      tables: { entries: [{ id: '2026-11-02|work', date: '2026-11-02', key: 'work', value: '1', updatedAt: 100 }] },
    })
    expect(result).toEqual({ added: 0, updated: 0, skipped: 1 })
    expect((await getDayValues('2026-11-02')).work).toBe('3')
  })

  it('refuses files that are not planner backups', async () => {
    await expect(importBackup({ hello: 'world' })).rejects.toThrow('not a planner backup')
  })
})
