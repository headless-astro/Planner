// Shopping (F26, F60): staples to keep at hand on tabs (Food first, plus any you make), and
// one-off things that go away once bought. Marking a staple low puts it on To buy.
import { db, type Staple } from './db'
import { listOrdered, newId, nextOrder, now, softDelete, update } from './store'

export const FOOD_TAB = 'Food'

export const listStaples = () => listOrdered(db.staples)
export const setStapleLow = (id: string, low: boolean) => update(db.staples, id, { low })
export const deleteStaple = (id: string) => softDelete(db.staples, id)

/** The tab a staple is on. */
export const tabOf = (staple: Pick<Staple, 'tab'>) => staple.tab || FOOD_TAB

/** On the To buy list: staples running low, and one-off things not bought yet. */
export const isToBuy = (staple: Pick<Staple, 'low' | 'oneOff'>) => staple.low || !!staple.oneOff

/** Food first, then the other tabs in the order they first appear. */
export function shoppingTabs(staples: readonly Staple[]): string[] {
  return [...new Set([FOOD_TAB, ...staples.map(tabOf)])]
}

export async function addStaple(name: string, group: string, options: { tab?: string; oneOff?: boolean } = {}): Promise<void> {
  const tab = options.tab && options.tab !== FOOD_TAB ? options.tab : undefined
  await db.staples.put({
    id: newId(),
    name,
    group,
    // A one-off thing is on the list as soon as it's added.
    low: !!options.oneOff,
    order: await nextOrder(db.staples),
    updatedAt: now(),
    ...(tab ? { tab } : {}),
    ...(options.oneOff ? { oneOff: true } : {}),
  })
}

/** Ticked off on To buy: a staple is stocked again; a one-off thing goes away. */
export const gotIt = (staple: Pick<Staple, 'id' | 'oneOff'>) => (staple.oneOff ? softDelete(db.staples, staple.id) : setStapleLow(staple.id, false))

/**
 * Puts things on the shopping list from a recipe (F61): a staple with the same name is marked
 * low; anything else is added to Food as a one-off. Returns how many went on the list.
 */
export async function addToShopping(names: readonly string[]): Promise<number> {
  const staples = await listStaples()
  let added = 0
  for (const raw of names) {
    const name = raw.trim()
    if (!name) continue
    const match = staples.find((staple) => staple.name.toLowerCase() === name.toLowerCase())
    if (match) {
      if (!isToBuy(match)) await setStapleLow(match.id, true)
    } else {
      await addStaple(name, 'From recipes', { oneOff: true })
    }
    added++
  }
  return added
}

/** Staples grouped, with groups in the order they first appear. */
export function groupStaples(staples: readonly Staple[]): { group: string; items: Staple[] }[] {
  const groups = new Map<string, Staple[]>()
  for (const staple of staples) groups.set(staple.group, [...(groups.get(staple.group) ?? []), staple])
  return [...groups].map(([group, items]) => ({ group, items }))
}
