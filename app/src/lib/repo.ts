// Reading and writing the planner's daily data on this device: the starting setup, day
// values (ticks, ratings, diary), snacks, to-dos, measurements, settings and history.
import { DEFAULT_EXERCISE, type BlockId, type ExerciseBlock, type ExercisePlan } from './exercise'
import { ALL_FEATURES, type Features } from './features'
import { db, type Dose, type Entry, type Habit, type Measurement, type Snack, type SnackDef, type Task } from './db'
import {
  DEFAULT_DOSES,
  DEFAULT_DRAWING_AREAS,
  DEFAULT_GOALS,
  DEFAULT_HABITS,
  DEFAULT_LISTS,
  DEFAULT_PROJECTS,
  DEFAULT_RECIPES,
  DEFAULT_REMINDERS,
  DEFAULT_ROUTINES,
  DEFAULT_SNACKS,
  DEFAULT_SPANISH,
  DEFAULT_STAPLES,
  DEFAULT_TARGETS,
  DEFAULT_APPEARANCE,
  DEFAULT_FOOD_RULES,
  DEFAULT_TOPICS,
  DEFAULT_TRACKS,
  WEEK_TEMPLATE,
  type Appearance,
  type DayTemplate,
  type Reminders,
  type Targets,
  type TimeOfDay,
} from './setup'
import { moveProjectsToLists } from './projects'
import { alive, byOrder, listOrdered, newId, nextOrder, now, reorder, softDelete, update } from './store'

// ── First run ──

/**
 * Copies the starting setup into the database on first run. Seeds use fixed ids and
 * updatedAt 0, so two devices seed identical records and any real edit wins when they sync.
 */
export async function ensureSeeded(): Promise<void> {
  const tables = [
    db.doses,
    db.habits,
    db.snackDefs,
    db.settings,
    db.routines,
    db.lists,
    db.staples,
    db.tracks,
    db.topics,
    db.recipes,
    db.drawingAreas,
    db.projects,
    db.goals,
    db.meta,
  ]
  await db.transaction('rw', tables, async () => {
    if (!(await db.meta.get('seeded'))) {
      await db.doses.bulkPut(DEFAULT_DOSES.map((dose, order) => ({ ...dose, order, updatedAt: 0 })))
      await db.habits.bulkPut(DEFAULT_HABITS.map((habit, order) => ({ ...habit, order, updatedAt: 0 })))
      await db.snackDefs.bulkPut(DEFAULT_SNACKS.map((snack, order) => ({ ...snack, order, updatedAt: 0 })))
      await db.settings.bulkPut([
        { id: 'targets', value: DEFAULT_TARGETS, updatedAt: 0 },
        { id: 'reminders', value: DEFAULT_REMINDERS, updatedAt: 0 },
      ])
      await db.meta.put({ id: 'seeded', value: now() })
    }
    // Added in M3.
    if (!(await db.meta.get('seeded-m3'))) {
      await db.routines.bulkPut(DEFAULT_ROUTINES.map((routine, order) => ({ ...routine, order, updatedAt: 0 })))
      await db.lists.bulkPut(DEFAULT_LISTS.map((list, order) => ({ ...list, order, updatedAt: 0 })))
      await db.staples.bulkPut(DEFAULT_STAPLES.map((staple, order) => ({ ...staple, low: false, order, updatedAt: 0 })))
      await db.tracks.bulkPut(
        DEFAULT_TRACKS.map((track, order) => ({ ...track, weekdays: [...track.weekdays], focus: [...track.focus], order, updatedAt: 0 })),
      )
      await db.meta.put({ id: 'seeded-m3', value: now() })
    }
    // Added in M4.
    if (!(await db.meta.get('seeded-m4'))) {
      await db.topics.bulkPut(
        DEFAULT_TOPICS.map((topic) => ({ ...topic, startNote: '', endNote: '', needsRevision: false, doneDate: null, updatedAt: 0 })),
      )
      await db.recipes.bulkPut(
        DEFAULT_RECIPES.map((recipe, order) => ({
          ...recipe,
          prepMinutes: null,
          ingredients: '',
          directions: '',
          link: '',
          enjoyment: null,
          order,
          updatedAt: 0,
        })),
      )
      await db.settings.put({ id: 'spanish', value: DEFAULT_SPANISH, updatedAt: 0 })
      await db.meta.put({ id: 'seeded-m4', value: now() })
    }
    // Added in M5.
    if (!(await db.meta.get('seeded-m5'))) {
      await db.drawingAreas.bulkPut(
        DEFAULT_DRAWING_AREAS.map((area, order) => ({ ...area, exercises: [...area.exercises], sources: [...area.sources], order, updatedAt: 0 })),
      )
      await db.projects.bulkPut(
        DEFAULT_PROJECTS.map((project, order) => ({ ...project, status: 'idea' as const, link: '', materials: [], notes: '', order, updatedAt: 0 })),
      )
      await db.goals.bulkPut(DEFAULT_GOALS.map((goal, order) => ({ ...goal, notes: '', reached: null, order, updatedAt: 0 })))
      await db.meta.put({ id: 'seeded-m5', value: now() })
    }
    // The skin routine was built in; now it's a habit like the rest, under "Also today". Its
    // id keeps every tick it already had, and its target comes along.
    if (!(await db.meta.get('seeded-skin'))) {
      if (!(await db.habits.get('skin'))) {
        const targets = await getSetting<{ skin?: unknown }>('targets', {})
        const weeklyTarget = typeof targets.skin === 'number' ? targets.skin : 7
        await db.habits.put({ id: 'skin', label: 'Skin routine', weeklyTarget, order: -1, updatedAt: 0 })
      }
      await db.meta.put({ id: 'seeded-skin', value: now() })
    }
  })
  // M7: projects live in Lists.
  await moveProjectsToLists()
}

// ── Setup lists: med doses, habits, snack list ──

export const listDoses = () => listOrdered(db.doses)
export const listHabits = () => listOrdered(db.habits)
export const listSnackDefs = () => listOrdered(db.snackDefs)

export async function addDose(label: string, time: TimeOfDay): Promise<void> {
  await db.doses.put({ id: newId(), label, time, order: await nextOrder(db.doses), updatedAt: now() })
}
export const updateDose = (id: string, changes: Partial<Pick<Dose, 'label' | 'time'>>) => update(db.doses, id, changes)
export const deleteDose = (id: string) => softDelete(db.doses, id)
export const moveDose = (id: string, step: -1 | 1) => reorder(db.doses, id, step)

export async function addHabit(label: string, weeklyTarget: number | null): Promise<void> {
  await db.habits.put({ id: newId(), label, weeklyTarget, order: await nextOrder(db.habits), updatedAt: now() })
}
export const updateHabit = (id: string, changes: Partial<Pick<Habit, 'label' | 'weeklyTarget'>>) => update(db.habits, id, changes)
export const deleteHabit = (id: string) => softDelete(db.habits, id)
export const moveHabit = (id: string, step: -1 | 1) => reorder(db.habits, id, step)

export async function addSnackDef(name: string, kcal: number): Promise<void> {
  await db.snackDefs.put({ id: newId(), name, kcal, order: await nextOrder(db.snackDefs), updatedAt: now() })
}
export const updateSnackDef = (id: string, changes: Partial<Pick<SnackDef, 'name' | 'kcal'>>) => update(db.snackDefs, id, changes)
export const deleteSnackDef = (id: string) => softDelete(db.snackDefs, id)
export const moveSnackDef = (id: string, step: -1 | 1) => reorder(db.snackDefs, id, step)

// ── Settings ──

export async function getSetting<T extends object>(id: string, fallback: T): Promise<T> {
  const row = await db.settings.get(id)
  // Merged over the defaults, so settings added in later versions get their default value.
  return row && !row.deleted ? { ...fallback, ...(row.value as Partial<T>) } : fallback
}

export const getTargets = () => getSetting<Targets>('targets', DEFAULT_TARGETS)
export const getReminders = () => getSetting<Reminders>('reminders', DEFAULT_REMINDERS)

export async function updateTargets(changes: Partial<Targets>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ id: 'targets', value: { ...(await getTargets()), ...changes }, updatedAt: now() })
  })
}

export async function updateReminders(changes: Partial<Reminders>): Promise<void> {
  await db.settings.put({ id: 'reminders', value: { ...(await getReminders()), ...changes }, updatedAt: now() })
}

// ── Exercise blocks (F59) ──

export async function getExercise(): Promise<ExercisePlan> {
  const plan = await getSetting<ExercisePlan>('exercise', DEFAULT_EXERCISE)
  // Blocks merge over the suggestions too, so a block that was never edited keeps them.
  return { ...plan, blocks: { ...DEFAULT_EXERCISE.blocks, ...plan.blocks } }
}

async function saveExercise(plan: ExercisePlan): Promise<void> {
  // A plain copy: values edited on screen can arrive wrapped, and the database only stores plain data.
  await db.settings.put({ id: 'exercise', value: JSON.parse(JSON.stringify(plan)) as ExercisePlan, updatedAt: now() })
}

export async function updateBlock(id: BlockId, changes: Partial<ExerciseBlock>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const plan = await getExercise()
    await saveExercise({ ...plan, blocks: { ...plan.blocks, [id]: { ...plan.blocks[id], ...changes } } })
  })
}

/** Makes a block the active one, starting at week 1 on the given day. */
export async function startBlock(id: BlockId, date: string): Promise<void> {
  await saveExercise({ ...(await getExercise()), active: id, start: date })
}

/** Puts a block back to my suggestion. */
export async function resetBlock(id: BlockId): Promise<void> {
  await updateBlock(id, DEFAULT_EXERCISE.blocks[id])
}

// ── What you use (F63) ──

/** Merged over everything on, so devices from before (and parts added later) have them on. */
export const getFeatures = () => getSetting<Features>('features', ALL_FEATURES)

export async function updateFeatures(changes: Partial<Features>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ id: 'features', value: { ...(await getFeatures()), ...changes }, updatedAt: now() })
  })
}

/** What's tracked beyond the basics (F56): period days are off unless turned on. */
export interface Tracking {
  periods: boolean
}
export const getTracking = () => getSetting<Tracking>('tracking', { periods: false })

export async function updateTracking(changes: Partial<Tracking>): Promise<void> {
  await db.settings.put({ id: 'tracking', value: { ...(await getTracking()), ...changes }, updatedAt: now() })
}

/** Colours (F28). They sync, so both devices look the same. */
export const getAppearance = () => getSetting<Appearance>('appearance', DEFAULT_APPEARANCE)

export async function updateAppearance(changes: Partial<Appearance>): Promise<void> {
  await db.settings.put({ id: 'appearance', value: { ...(await getAppearance()), ...changes }, updatedAt: now() })
}

/** The food rules shown on Today (F29). */
export const getFoodRules = async () => (await getSetting<{ rules: string[] }>('foodRules', { rules: DEFAULT_FOOD_RULES })).rules

export async function updateFoodRules(rules: string[]): Promise<void> {
  await db.settings.put({ id: 'foodRules', value: { rules }, updatedAt: now() })
}

/** The week's rhythm, Monday first (F30). Days that were never changed keep the starting week. */
export async function getWeek(): Promise<DayTemplate[]> {
  const { days } = await getSetting<{ days: unknown }>('week', { days: WEEK_TEMPLATE })
  return WEEK_TEMPLATE.map((start, index) => {
    const saved: unknown = Array.isArray(days) ? days[index] : undefined
    return typeof saved === 'object' && saved !== null ? { ...start, ...(saved as Partial<DayTemplate>) } : start
  })
}

export async function updateWeekDay(index: number, changes: Partial<DayTemplate>): Promise<void> {
  // One change at a time, so two quick edits can't overwrite each other.
  await db.transaction('rw', db.settings, async () => {
    const days = await getWeek()
    days[index] = { ...days[index], ...changes }
    // A plain copy: activities edited on screen can arrive wrapped, and the database only stores plain data.
    await db.settings.put({ id: 'week', value: { days: JSON.parse(JSON.stringify(days)) as DayTemplate[] }, updatedAt: now() })
  })
}

export const resetWeek = () => softDelete(db.settings, 'week')

// ── Day values: ticks, work rating, food rules, diary, note ──

export type DayValues = Record<string, unknown>

const entryId = (date: string, key: string) => `${date}|${key}`

export async function setEntry(date: string, key: string, value: unknown): Promise<void> {
  await db.entries.put({ id: entryId(date, key), date, key, value, updatedAt: now() })
}

export async function clearEntry(date: string, key: string): Promise<void> {
  await db.entries.put({ id: entryId(date, key), date, key, value: null, deleted: true, updatedAt: now() })
}

/** Flips a tick and returns its new state. */
export async function toggleTick(date: string, itemId: string): Promise<boolean> {
  const key = `tick:${itemId}`
  return db.transaction('rw', db.entries, async () => {
    const current = await db.entries.get(entryId(date, key))
    const done = !(current && !current.deleted && current.value === true)
    await db.entries.put({ id: entryId(date, key), date, key, value: done, updatedAt: now() })
    return done
  })
}

export async function getDayValues(date: string): Promise<DayValues> {
  const rows = alive(await db.entries.where('date').equals(date).toArray())
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

export async function getEntriesBetween(from: string, to: string): Promise<Entry[]> {
  return alive(await db.entries.where('date').between(from, to, true, true).toArray())
}

// ── Snacks eaten ──

export async function addSnack(date: string, name: string, kcal: number | null): Promise<void> {
  await db.snacks.put({ id: newId(), date, name, kcal, updatedAt: now() })
}

export const removeSnack = (id: string) => softDelete(db.snacks, id)

export async function getSnacks(date: string): Promise<Snack[]> {
  return alive(await db.snacks.where('date').equals(date).toArray()).sort((a, b) => a.updatedAt - b.updatedAt)
}

// ── To-dos: tasks without a list ──

export async function addTodo(title: string, date: string): Promise<void> {
  await db.tasks.put({
    id: newId(),
    title,
    date,
    due: null,
    listId: null,
    parentId: null,
    done: false,
    doneDate: null,
    order: await nextOrder(db.tasks),
    updatedAt: now(),
  })
}

export const setTodoDone = (id: string, done: boolean, date: string) => update(db.tasks, id, { done, doneDate: done ? date : null })
export const moveTodo = (id: string, date: string) => update(db.tasks, id, { date })
export const deleteTodo = (id: string) => softDelete(db.tasks, id)

/**
 * The to-dos for a day: the ones done that day, plus the unfinished ones planned for it.
 * On today, unfinished to-dos from earlier days carry over (D21).
 */
export async function getTodos(date: string, isToday: boolean): Promise<Task[]> {
  const todos = alive(await db.tasks.toArray()).filter((task) => task.listId === null && task.parentId === null)
  return todos
    .filter((task) => (task.done ? task.doneDate === date : task.date !== null && (isToday ? task.date <= date : task.date === date)))
    .sort(byOrder)
}

// ── Weigh-ins and waist ──

export type MeasurementKind = Measurement['kind']
export type DayMeasurements = Partial<Record<MeasurementKind, number>>

const measurementId = (date: string, kind: MeasurementKind) => `${date}|${kind}`

/** Saves a measurement; an empty or invalid value removes it. */
export async function setMeasurement(date: string, kind: MeasurementKind, value: number | null): Promise<void> {
  if (value === null || !Number.isFinite(value) || value <= 0) return softDelete(db.measurements, measurementId(date, kind))
  await db.measurements.put({ id: measurementId(date, kind), date, kind, value, updatedAt: now() })
}

export async function getDayMeasurements(date: string): Promise<DayMeasurements> {
  const rows = alive(await db.measurements.where('date').equals(date).toArray())
  return Object.fromEntries(rows.map((row) => [row.kind, row.value]))
}

/** Oldest first. */
export async function getMeasurements(kind: MeasurementKind): Promise<Measurement[]> {
  return alive(await db.measurements.where('kind').equals(kind).toArray()).sort((a, b) => a.date.localeCompare(b.date))
}

// ── Device-only bookkeeping ──

export async function getMeta<T>(id: string): Promise<T | undefined> {
  return (await db.meta.get(id))?.value as T | undefined
}

export async function setMeta(id: string, value: unknown): Promise<void> {
  await db.meta.put({ id, value })
}
