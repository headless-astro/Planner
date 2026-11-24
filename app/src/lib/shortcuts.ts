// Shortcuts on Today (F82): chips next to the date that open a screen in one tap, such as the
// Work list. They sync like the other settings.
import { db, type TaskList, type Track } from './db'
import type { Features } from './features'
import type { ShelfInfo } from './media'
import { getSetting } from './repo'
import { now } from './store'

export interface Shortcut {
  label: string
  href: string
}

/** Something a shortcut can open, grouped in the picker. */
export interface ShortcutChoice extends Shortcut {
  group: 'Lists' | 'Tracks' | 'Screens' | 'More'
}

export async function getShortcuts(): Promise<Shortcut[]> {
  const { list } = await getSetting<{ list: Shortcut[] }>('shortcuts', { list: [] })
  return Array.isArray(list) ? list : []
}

async function saveShortcuts(list: Shortcut[]): Promise<void> {
  await db.settings.put({ id: 'shortcuts', value: { list: JSON.parse(JSON.stringify(list)) as Shortcut[] }, updatedAt: now() })
}

/** Adds a shortcut at the end; one that's already there isn't added twice. */
export async function addShortcut(shortcut: Shortcut): Promise<void> {
  const list = await getShortcuts()
  if (list.some((existing) => existing.href === shortcut.href)) return
  await saveShortcuts([...list, shortcut])
}

export async function removeShortcut(href: string): Promise<void> {
  await saveShortcuts((await getShortcuts()).filter((shortcut) => shortcut.href !== href))
}

export async function moveShortcut(href: string, step: -1 | 1): Promise<void> {
  const list = await getShortcuts()
  const index = list.findIndex((shortcut) => shortcut.href === href)
  const target = index + step
  if (index < 0 || target < 0 || target >= list.length) return
  ;[list[index], list[target]] = [list[target], list[index]]
  await saveShortcuts(list)
}

/**
 * What a shortcut can open: each list, each track, the screens inside Plans, Me and Insights, and
 * the parts of More that are on.
 */
export function shortcutChoices(input: {
  lists: readonly Pick<TaskList, 'id' | 'name'>[]
  tracks: readonly Pick<Track, 'id' | 'name'>[]
  shelves: readonly Pick<ShelfInfo, 'title' | 'href'>[]
  features: Features
}): ShortcutChoice[] {
  const screens: [string, string, boolean][] = [
    ['Upcoming', '#/upcoming', true],
    ['The week', '#/week', true],
    ['Routines', '#/routines', true],
    ['Insights', '#/insights', true],
    ['Shopping', '#/shopping', input.features.shopping],
    ['Exercise', '#/exercise', input.features.exercise],
    ['Recipes', '#/recipes', input.features.recipes],
    ['Goals', '#/goals', input.features.goals],
  ]
  return [
    ...input.lists.map((list) => ({ group: 'Lists' as const, label: list.name, href: `#/lists/${list.id}` })),
    ...input.tracks.map((track) => ({ group: 'Tracks' as const, label: track.name, href: `#/track/${track.id}` })),
    ...screens.filter(([, , on]) => on).map(([label, href]) => ({ group: 'Screens' as const, label, href })),
    ...input.shelves.map((shelf) => ({ group: 'More' as const, label: shelf.title, href: shelf.href })),
  ]
}
