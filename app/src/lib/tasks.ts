// Task lists (Life, Work, Vela…) with deadlines, subtasks and an archive (F11).
// To-dos for a day are tasks without a list; they live in repo.ts.
import { formatShort, parseDate } from './dates'
import { db, type Task, type TaskList } from './db'
import { alive, byOrder, listOrdered, newId, nextOrder, now, reorder, softDelete, update } from './store'

export const listLists = () => listOrdered(db.lists)

/** Creates a list and returns its id. */
export async function addList(name: string): Promise<string> {
  const id = newId()
  await db.lists.put({ id, name, showOnToday: true, order: await nextOrder(db.lists), updatedAt: now() })
  return id
}

export const updateList = (id: string, changes: Partial<Pick<TaskList, 'name' | 'showOnToday'>>) => update(db.lists, id, changes)
export const moveList = (id: string, step: -1 | 1) => reorder(db.lists, id, step)

/** Deletes a list with its tasks. */
export async function deleteList(id: string): Promise<void> {
  await db.transaction('rw', db.lists, db.tasks, async () => {
    await softDelete(db.lists, id)
    for (const task of alive(await db.tasks.where('listId').equals(id).toArray())) await softDelete(db.tasks, task.id)
  })
}

export interface TaskWithSubtasks extends Task {
  subtasks: Task[]
}

export interface ListTasks {
  open: TaskWithSubtasks[]
  /** Done tasks, most recent first. They stay here instead of being deleted. */
  archived: Task[]
}

export async function getListTasks(listId: string): Promise<ListTasks> {
  const tasks = alive(await db.tasks.where('listId').equals(listId).toArray())
  const topLevel = tasks.filter((task) => task.parentId === null)
  const subtasksOf = (id: string) => tasks.filter((task) => task.parentId === id).sort(byOrder)
  return {
    open: topLevel
      .filter((task) => !task.done)
      .sort(byOrder)
      .map((task) => ({ ...task, subtasks: subtasksOf(task.id) })),
    archived: topLevel.filter((task) => task.done).sort((a, b) => (b.doneDate ?? '').localeCompare(a.doneDate ?? '')),
  }
}

export async function addTask(listId: string, title: string, options: { parentId?: string; due?: string | null } = {}): Promise<void> {
  await db.tasks.put({
    id: newId(),
    title,
    date: null,
    due: options.due ?? null,
    listId,
    parentId: options.parentId ?? null,
    done: false,
    doneDate: null,
    order: await nextOrder(db.tasks),
    updatedAt: now(),
  })
}

export const setTaskDone = (id: string, done: boolean, date: string) => update(db.tasks, id, { done, doneDate: done ? date : null })
export const updateTask = (id: string, changes: Partial<Pick<Task, 'title' | 'due' | 'notes' | 'link'>>) => update(db.tasks, id, changes)

/** Deletes a task with its subtasks. */
export async function deleteTask(id: string): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    await softDelete(db.tasks, id)
    for (const subtask of alive(await db.tasks.where('parentId').equals(id).toArray())) await softDelete(db.tasks, subtask.id)
  })
}

export interface DueTask {
  task: Task
  listName: string
}

/**
 * List tasks for a day's screen: open ones due on that day (on today, also late ones) and ones
 * done that day. Lists that don't show on Today, like Vela, are left out (D7).
 */
export async function getDueTasks(date: string, isToday: boolean): Promise<DueTask[]> {
  const lists = new Map((await listLists()).filter((list) => list.showOnToday).map((list) => [list.id, list.name]))
  return alive(await db.tasks.toArray())
    .filter((task) => task.listId !== null && lists.has(task.listId))
    .filter((task) => (task.done ? task.doneDate === date : task.due !== null && (isToday ? task.due <= date : task.due === date)))
    .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? '') || a.order - b.order)
    .map((task) => ({ task, listName: lists.get(task.listId ?? '') ?? '' }))
}

/** "due today", "late since Mon 2 Nov" or "due Thu 5 Nov". */
export function dueLabel(task: Pick<Task, 'due'>, date: string): string {
  if (!task.due) return ''
  if (task.due === date) return 'due today'
  if (task.due < date) return `late since ${formatShort(parseDate(task.due))}`
  return `due ${formatShort(parseDate(task.due))}`
}
