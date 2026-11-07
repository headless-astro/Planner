// How a device starts (F62): on a new device the app asks first, instead of filling in one
// person's setup. Devices from before count as "mine" and carry on as they were.
import { addDays, parseDate, toISODate, todayISO } from './dates'
import { db } from './db'
import { FRESH_FEATURES, FRESH_WEEK } from './features'
import { migrateToTracks } from './migrateTracks'
import { moveProjectsToLists } from './projects'
import { ensureSeeded } from './repo'
import { DEFAULT_REMINDERS, DEFAULT_TARGETS } from './setup'
import { now } from './store'

/**
 * mine: the original setup from the plan (the first person's).
 * empty: nothing filled in. examples: a small general sample.
 * link: this device is about to sync with another one, which brings everything.
 */
export type StartMode = 'mine' | 'empty' | 'examples' | 'link'

const START = 'start'
/** The steps of the original setup; a fresh start marks them done so they never run. */
const SEED_STEPS = ['seeded', 'seeded-m3', 'seeded-m4', 'seeded-m5', 'seeded-skin']

/** How this device started, or null on a new device that hasn't chosen yet. */
export async function getStart(): Promise<StartMode | null> {
  const start = await db.meta.get(START)
  if (start && typeof start.value === 'string') return start.value as StartMode
  return (await db.meta.get('seeded')) ? 'mine' : null
}

/** Runs on every start. Returns null when the device still has to choose. */
export async function prepareDevice(): Promise<StartMode | null> {
  const start = await getStart()
  if (start === 'mine') await ensureSeeded()
  else if (start) await moveProjectsToLists()
  // Tech study, Spanish and drawing as tracks (D83): only adds what's missing.
  if (start) await migrateToTracks(start === 'mine')
  return start
}

/** A small sample anyone can use: change or delete any of it (F62). */
async function addExamples(): Promise<void> {
  const stamp = now()
  const today = todayISO()
  const inAWeek = toISODate(addDays(parseDate(today), 7))
  await db.habits.bulkPut([
    { id: 'read', label: 'Read', weeklyTarget: 3, order: 0, updatedAt: stamp },
    { id: 'ex-walk', label: 'Walk', weeklyTarget: 4, order: 1, updatedAt: stamp },
    { id: 'ex-tidy', label: 'Tidy up', weeklyTarget: null, order: 2, updatedAt: stamp },
  ])
  await db.routines.bulkPut([
    { id: 'ex-sheets', name: 'Change the bed sheets', area: 'Home', intervalDays: 14, order: 0, updatedAt: stamp },
    { id: 'ex-bathroom', name: 'Clean the bathroom', area: 'Home', intervalDays: 7, order: 1, updatedAt: stamp },
    { id: 'ex-plants', name: 'Water the plants', area: 'Home', intervalDays: 4, order: 2, updatedAt: stamp },
    { id: 'ex-call', name: 'Call family', area: 'People', intervalDays: 7, order: 3, updatedAt: stamp },
  ])
  await db.lists.put({ id: 'ex-life', name: 'Life', showOnToday: true, order: 0, updatedAt: stamp })
  await db.tasks.bulkPut([
    { id: 'ex-task-try', title: 'Try the planner for a week', date: null, due: inAWeek, listId: 'ex-life', parentId: null, done: false, doneDate: null, order: 0, updatedAt: stamp },
    { id: 'ex-task-settings', title: 'Look through Settings → What you use', date: null, due: null, listId: 'ex-life', parentId: null, done: false, doneDate: null, order: 1, updatedAt: stamp },
  ])
  await db.staples.bulkPut(
    ['Milk', 'Eggs', 'Bread', 'Fruit', 'Coffee or tea'].map((name, order) => ({ id: `ex-staple-${order}`, name, group: 'Basics', low: false, order, updatedAt: stamp })),
  )
  await db.goals.put({ id: 'ex-goal-read', title: 'Read more', parentId: null, measure: 'reading', notes: '', reached: null, order: 0, target: 12, updatedAt: stamp })
}

/** Starts this device the chosen way. */
export async function startDevice(mode: StartMode): Promise<void> {
  if (mode === 'mine') {
    await db.meta.put({ id: START, value: mode })
    await ensureSeeded()
    return
  }
  await db.transaction('rw', [db.meta, db.settings, db.habits, db.routines, db.lists, db.tasks, db.staples, db.goals], async () => {
    for (const id of SEED_STEPS) await db.meta.put({ id, value: now() })
    // A device about to sync gets its settings from the other device.
    if (mode !== 'link') {
      const stamp = now()
      await db.settings.bulkPut([
        { id: 'features', value: FRESH_FEATURES, updatedAt: stamp },
        { id: 'week', value: { days: FRESH_WEEK }, updatedAt: stamp },
        { id: 'targets', value: { ...DEFAULT_TARGETS, weeklyLoss: null }, updatedAt: stamp },
        { id: 'reminders', value: DEFAULT_REMINDERS, updatedAt: stamp },
      ])
      if (mode === 'examples') await addExamples()
    }
    await db.meta.put({ id: START, value: mode })
  })
}
