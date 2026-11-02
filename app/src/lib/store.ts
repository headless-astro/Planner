// Helpers shared by the data modules. Every write stamps updatedAt, and nothing is
// hard-deleted (records get a deleted flag instead), so changes can sync between devices
// later (PLAN.md 11.4).
import type { Table } from 'dexie'
import { db, type Synced } from './db'

export const now = () => Date.now()
export const newId = () => crypto.randomUUID()
export const alive = <T extends Synced>(rows: T[]): T[] => rows.filter((row) => !row.deleted)
export const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

/** The live records of an ordered table, in order. */
export async function listOrdered<T extends Synced & { order: number }>(table: Table<T, string>): Promise<T[]> {
  return alive(await table.toArray()).sort(byOrder)
}

/** Applies changes to a stored record. The record type comes from the table, not the changes. */
export async function update<T extends Synced>(table: Table<T, string>, id: string, changes: NoInfer<Partial<T>>): Promise<void> {
  const row = await table.get(id)
  if (row) await table.put({ ...row, ...changes, updatedAt: now() })
}

export async function softDelete<T extends Synced>(table: Table<T, string>, id: string): Promise<void> {
  const row = await table.get(id)
  if (row && !row.deleted) await table.put({ ...row, deleted: true, updatedAt: now() })
}

export async function nextOrder<T extends Synced & { order: number }>(table: Table<T, string>): Promise<number> {
  const rows = alive(await table.toArray())
  return rows.length ? Math.max(...rows.map((row) => row.order)) + 1 : 0
}

/** Moves a record one place up (-1) or down (1) in its list. */
export async function reorder<T extends Synced & { order: number }>(table: Table<T, string>, id: string, step: -1 | 1): Promise<void> {
  await db.transaction('rw', table, async () => {
    const rows = alive(await table.toArray()).sort(byOrder)
    const index = rows.findIndex((row) => row.id === id)
    const target = index + step
    if (index < 0 || target < 0 || target >= rows.length) return
    ;[rows[index], rows[target]] = [rows[target], rows[index]]
    const stamp = now()
    await table.bulkPut(rows.map((row, order) => (row.order === order ? row : { ...row, order, updatedAt: stamp })))
  })
}
