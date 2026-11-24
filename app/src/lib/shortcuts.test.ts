import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { ALL_FEATURES } from './features'
import { ensureSeeded } from './repo'
import { addShortcut, getShortcuts, moveShortcut, removeShortcut, shortcutChoices } from './shortcuts'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded()
})

describe('shortcuts on Today (F82)', () => {
  it('adds each one once, moves and removes them', async () => {
    await addShortcut({ label: 'Work', href: '#/lists/list-work' })
    await addShortcut({ label: 'Upcoming', href: '#/upcoming' })
    await addShortcut({ label: 'Work', href: '#/lists/list-work' })
    expect((await getShortcuts()).map((shortcut) => shortcut.label)).toEqual(['Work', 'Upcoming'])

    await moveShortcut('#/upcoming', -1)
    expect((await getShortcuts()).map((shortcut) => shortcut.label)).toEqual(['Upcoming', 'Work'])

    await removeShortcut('#/upcoming')
    expect(await getShortcuts()).toEqual([{ label: 'Work', href: '#/lists/list-work' }])
  })

  it('offers each list and track, and leaves out parts that are turned off', () => {
    const choices = shortcutChoices({
      lists: [{ id: 'list-work', name: 'Work' }],
      tracks: [{ id: 'track-1', name: 'Driving' }],
      shelves: [{ title: 'Books', href: '#/books' }],
      features: { ...ALL_FEATURES, shopping: false },
    })
    expect(choices).toContainEqual({ group: 'Lists', label: 'Work', href: '#/lists/list-work' })
    expect(choices).toContainEqual({ group: 'Tracks', label: 'Driving', href: '#/track/track-1' })
    expect(choices).toContainEqual({ group: 'More', label: 'Books', href: '#/books' })
    expect(choices.map((choice) => choice.label)).not.toContain('Shopping')
  })
})
