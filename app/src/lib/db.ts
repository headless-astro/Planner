// The database on this device (IndexedDB, through Dexie).
import Dexie, { type Table } from 'dexie'
import type { GoalMeasure, TimeOfDay } from './setup'

/** Every synced record has an id, a last-changed time and a deleted flag (PLAN.md 11.4). */
export interface Synced {
  id: string
  updatedAt: number
  deleted?: boolean
}

/**
 * One value for one day: a tick ("tick:<item id>" → true/false), the work rating, food rules,
 * food diary or note. The id is "<date>|<key>", so the same change made on two devices lands
 * on the same record.
 */
export interface Entry extends Synced {
  date: string
  key: string
  value: unknown
}

export interface Snack extends Synced {
  date: string
  name: string
  kcal: number
}

/** A to-do. Task lists, deadlines and subtasks (M3) use the same record. */
export interface Task extends Synced {
  title: string
  /** The day it's planned for. Unfinished to-dos carry over to today (D21). */
  date: string | null
  due: string | null
  listId: string | null
  parentId: string | null
  done: boolean
  doneDate: string | null
  order: number
}

export interface Measurement extends Synced {
  date: string
  kind: 'weight' | 'waist'
  value: number
}

export interface Dose extends Synced {
  label: string
  time: TimeOfDay
  order: number
}

export interface Habit extends Synced {
  label: string
  weeklyTarget: number | null
  order: number
}

export interface SnackDef extends Synced {
  name: string
  kcal: number
  order: number
}

export interface Setting extends Synced {
  value: unknown
}

/** Something that repeats every few days, counted from the last time it was done. */
export interface Routine extends Synced {
  name: string
  area: string
  intervalDays: number
  order: number
}

/** One completion of a routine. The id is "<routine id>|<date>". */
export interface RoutineLog extends Synced {
  routineId: string
  date: string
}

export interface TaskList extends Synced {
  name: string
  /** Whether tasks due from this list show on Today (Vela doesn't, D7). */
  showOnToday: boolean
  order: number
}

/** Something to keep at hand; when it's low it goes on the shopping list. */
export interface Staple extends Synced {
  name: string
  group: string
  low: boolean
  order: number
}

/** A short practice track, like a month of driving (PLAN.md 7.9). */
export interface Track extends Synced {
  name: string
  start: string
  weeks: number
  /** Monday = 0 … Sunday = 6. */
  weekdays: number[]
  /** One line per week. */
  focus: string[]
  order: number
}

/** One practice session. The id is "<track id>|<date>". */
export interface TrackSession extends Synced {
  trackId: string
  date: string
  minutes: number | null
  practiced: string
  feeling: string
}

/** A stretch of crunch days; end is null while it's still on (D20). */
export interface Crunch extends Synced {
  start: string
  end: string | null
}

/** A tech study topic (PLAN.md Appendix B). */
export interface Topic extends Synced {
  number: number
  block: string
  title: string
  subtopics: string
  /** Rule 2: two lines before the session… */
  startNote: string
  /** …and three lines after. */
  endNote: string
  needsRevision: boolean
  doneDate: string | null
}

/** Spanish practice: video minutes, a book session or reading pages (PLAN.md 7.5). */
export interface SpanishLog extends Synced {
  date: string
  kind: 'video' | 'book' | 'reading'
  minutes: number | null
  /** For a book session: the unit, or null for a review session. */
  unit: number | null
  pages: number | null
  title: string
}

/** A go-to meal (PLAN.md 7.1). */
export interface Recipe extends Synced {
  name: string
  meal: string
  batch: boolean
  freezes: boolean
  prepMinutes: number | null
  ingredients: string
  directions: string
  link: string
  /** 1–5 */
  enjoyment: number | null
  order: number
}

/** One time a recipe was cooked. The id is "<recipe id>|<date>". */
export interface CookedLog extends Synced {
  recipeId: string
  date: string
}

export type MediaKind = 'book' | 'game' | 'watch'
export type MediaStatus = 'want' | 'active' | 'done' | 'stopped'

/** A book, game, movie or show (PLAN.md S18). */
export interface MediaItem extends Synced {
  kind: MediaKind
  title: string
  /** Books only. */
  author: string
  /** Movies and shows only. */
  format: 'movie' | 'show' | null
  genre: string
  status: MediaStatus
  started: string | null
  finished: string | null
  /** 1–5 */
  rating: number | null
  notes: string
}

export interface Material {
  name: string
  have: boolean
}

/** A craft project (PLAN.md 1.8, S19). */
export interface Project extends Synced {
  name: string
  kind: string
  status: 'idea' | 'active' | 'done'
  link: string
  /** What you still need shows on the shopping list. */
  materials: Material[]
  notes: string
  order: number
}

/** A day spent on a craft project. The id is "<project id>|<date>". */
export interface CraftLog extends Synced {
  projectId: string
  date: string
}

/** A goal, or a sub-goal when it has a parent (PLAN.md 1.8). */
export interface Goal extends Synced {
  title: string
  parentId: string | null
  /** Where its progress line comes from. */
  measure: GoalMeasure | null
  notes: string
  /** The date it was reached. */
  reached: string | null
  order: number
}

/** A drawing study area with its exercises and sources (PLAN.md 7.6). */
export interface DrawingArea extends Synced {
  name: string
  exercises: string[]
  sources: string[]
  order: number
}

/** A drawing study session. The id is "<date>|drawing", one a day. */
export interface DrawingLog extends Synced {
  date: string
  areaId: string
  exercise: string
  minutes: number | null
  note: string
}

/** Bookkeeping for this device only: never synced or exported. */
export interface Meta {
  id: string
  value: unknown
}

/** The tables that sync between devices and go into backups. */
export const SYNCED_TABLES = [
  'entries',
  'snacks',
  'tasks',
  'measurements',
  'doses',
  'habits',
  'snackDefs',
  'settings',
  'routines',
  'routineLogs',
  'lists',
  'staples',
  'tracks',
  'trackSessions',
  'crunches',
  'topics',
  'spanishLogs',
  'recipes',
  'cookedLogs',
  'media',
  'projects',
  'craftLogs',
  'goals',
  'drawingAreas',
  'drawingLogs',
] as const
export type SyncedTableName = (typeof SYNCED_TABLES)[number]

/** Marks a record this device changed and the server doesn't have yet (PLAN.md 12.6). */
export const DIRTY = '_dirty'
/** Put on a record written from the server's copy, so it isn't marked; never stored. */
export const FROM_SYNC = '_fromSync'

/** Each synced table's indexes before sync. */
const INDEXES: Record<SyncedTableName, string> = {
  entries: 'id, date, key',
  snacks: 'id, date',
  tasks: 'id, date, doneDate, listId, parentId',
  measurements: 'id, date, kind',
  doses: 'id',
  habits: 'id',
  snackDefs: 'id',
  settings: 'id',
  routines: 'id',
  routineLogs: 'id, routineId, date',
  lists: 'id',
  staples: 'id',
  tracks: 'id',
  trackSessions: 'id, trackId, date',
  crunches: 'id',
  topics: 'id',
  spanishLogs: 'id, date, kind',
  recipes: 'id',
  cookedLogs: 'id, recipeId, date',
  media: 'id, kind',
  projects: 'id',
  craftLogs: 'id, projectId, date',
  goals: 'id',
  drawingAreas: 'id',
  drawingLogs: 'id, date',
}

type Row = Synced & Record<string, unknown>

export class PlannerDB extends Dexie {
  entries!: Table<Entry, string>
  snacks!: Table<Snack, string>
  tasks!: Table<Task, string>
  measurements!: Table<Measurement, string>
  doses!: Table<Dose, string>
  habits!: Table<Habit, string>
  snackDefs!: Table<SnackDef, string>
  settings!: Table<Setting, string>
  routines!: Table<Routine, string>
  routineLogs!: Table<RoutineLog, string>
  lists!: Table<TaskList, string>
  staples!: Table<Staple, string>
  tracks!: Table<Track, string>
  trackSessions!: Table<TrackSession, string>
  crunches!: Table<Crunch, string>
  topics!: Table<Topic, string>
  spanishLogs!: Table<SpanishLog, string>
  recipes!: Table<Recipe, string>
  cookedLogs!: Table<CookedLog, string>
  media!: Table<MediaItem, string>
  projects!: Table<Project, string>
  craftLogs!: Table<CraftLog, string>
  goals!: Table<Goal, string>
  drawingAreas!: Table<DrawingArea, string>
  drawingLogs!: Table<DrawingLog, string>
  meta!: Table<Meta, string>

  constructor() {
    // A distinct name, because all GitHub Pages sites on one account share browser storage.
    super('planner-app')
    this.version(1).stores({
      entries: 'id, date, key',
      snacks: 'id, date',
      tasks: 'id, date, doneDate, listId, parentId',
      measurements: 'id, date, kind',
      doses: 'id',
      habits: 'id',
      snackDefs: 'id',
      settings: 'id',
      meta: 'id',
    })
    // M3: routines, task lists, staples, practice tracks, crunch days.
    this.version(2).stores({
      routines: 'id',
      routineLogs: 'id, routineId, date',
      lists: 'id',
      staples: 'id',
      tracks: 'id',
      trackSessions: 'id, trackId, date',
      crunches: 'id',
    })
    // M4: tech study, Spanish, recipes.
    this.version(3).stores({
      topics: 'id',
      spanishLogs: 'id, date, kind',
      recipes: 'id',
      cookedLogs: 'id, recipeId, date',
    })
    // M5: books, games and shows; craft projects; goals; the drawing plan.
    this.version(4).stores({
      media: 'id, kind',
      projects: 'id',
      craftLogs: 'id, projectId, date',
      goals: 'id',
      drawingAreas: 'id',
      drawingLogs: 'id, date',
    })
    // M2: sync. An index of the records still to send to the server.
    this.version(5)
      .stores(Object.fromEntries(SYNCED_TABLES.map((name) => [name, `${INDEXES[name]}, ${DIRTY}`])))
      .upgrade(async (transaction) => {
        // Everything saved before sync existed has to reach the server once.
        for (const name of SYNCED_TABLES) {
          await transaction
            .table<Row, string>(name)
            .toCollection()
            .modify((row) => {
              if (row.updatedAt > 0) row[DIRTY] = 1
            })
        }
      })
  }
}

export const db = new PlannerDB()

// ── Change tracking for sync ──

let localChange: (() => void) | null = null

/** Runs after each local change to a synced record. Sync uses it to send changes soon. */
export function onLocalChange(listener: (() => void) | null): void {
  localChange = listener
}

for (const name of SYNCED_TABLES) {
  const table = db.table<Row, string>(name)
  table.hook('creating', (_key, row) => {
    if (row[FROM_SYNC]) {
      delete row[FROM_SYNC]
      return
    }
    // Starting records (updatedAt 0) never sync: every device makes the same ones.
    if (row.updatedAt > 0) {
      row[DIRTY] = 1
      localChange?.()
    }
  })
  table.hook('updating', (modifications: object, _key, row) => {
    const changes = modifications as Record<string, unknown>
    if (FROM_SYNC in changes) return { [FROM_SYNC]: undefined }
    // Only a real change counts: modify() also calls this for rows it leaves as they are.
    if (!Object.keys(changes).some((key) => key !== DIRTY)) return
    const updatedAt = 'updatedAt' in changes ? changes.updatedAt : row.updatedAt
    if (typeof updatedAt === 'number' && updatedAt > 0) {
      localChange?.()
      return { [DIRTY]: 1 }
    }
  })
}
