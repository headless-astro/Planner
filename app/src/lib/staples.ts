// Staples: things to keep at hand. Marking one as low puts it on the shopping list (F26).
import { db, type Staple } from './db'
import { listOrdered, newId, nextOrder, now, softDelete, update } from './store'

export const listStaples = () => listOrdered(db.staples)
export const setStapleLow = (id: string, low: boolean) => update(db.staples, id, { low })
export const deleteStaple = (id: string) => softDelete(db.staples, id)

export async function addStaple(name: string, group: string): Promise<void> {
  await db.staples.put({ id: newId(), name, group, low: false, order: await nextOrder(db.staples), updatedAt: now() })
}

/** Staples grouped, with groups in the order they first appear. */
export function groupStaples(staples: readonly Staple[]): { group: string; items: Staple[] }[] {
  const groups = new Map<string, Staple[]>()
  for (const staple of staples) groups.set(staple.group, [...(groups.get(staple.group) ?? []), staple])
  return [...groups].map(([group, items]) => ({ group, items }))
}
