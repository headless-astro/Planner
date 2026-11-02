// Recipes: your go-to meals, for the days you need to cook (PLAN.md 7.1, F15).
import { db, type CookedLog, type Recipe } from './db'
import { setEntry } from './repo'
import { alive, listOrdered, newId, nextOrder, now, softDelete, update } from './store'

export const listRecipes = () => listOrdered(db.recipes)

export async function addRecipe(name: string, meal: string): Promise<void> {
  await db.recipes.put({
    id: newId(),
    name,
    meal,
    batch: false,
    freezes: false,
    prepMinutes: null,
    ingredients: '',
    directions: '',
    link: '',
    enjoyment: null,
    order: await nextOrder(db.recipes),
    updatedAt: now(),
  })
}

export type RecipeChanges = Partial<Omit<Recipe, 'id' | 'updatedAt' | 'deleted' | 'order'>>

export const updateRecipe = (id: string, changes: RecipeChanges) => update(db.recipes, id, changes)
export const deleteRecipe = (id: string) => softDelete(db.recipes, id)

/** Newest first. */
export async function listCooked(): Promise<CookedLog[]> {
  return alive(await db.cookedLogs.toArray()).sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Logs cooking a recipe on a date, or undoes it. Cooking ticks Cooked for the day (F5);
 * undoing clears it again unless another recipe was cooked that day.
 */
export async function setCooked(recipeId: string, date: string, done: boolean): Promise<void> {
  const id = `${recipeId}|${date}`
  if (!done) {
    await softDelete(db.cookedLogs, id)
    const others = alive(await db.cookedLogs.where('date').equals(date).toArray())
    if (!others.length) await setEntry(date, 'tick:cooked', false)
    return
  }
  await db.cookedLogs.put({ id, recipeId, date, updatedAt: now() })
  await setEntry(date, 'tick:cooked', true)
}
