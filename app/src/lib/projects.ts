// Projects live in Lists now (F34, D53): a project is a task with subtasks. This moves the
// craft projects from the old Projects screen (M5) into a "Projects" list, once per project.
import { toISODate } from './dates'
import { db, type Project, type Task, type TaskList } from './db'
import { alive, nextOrder, now } from './store'

/** The list made for the moved projects, when there's no "Projects" list already. */
export const PROJECTS_LIST_ID = 'list-projects'

/** Fixed ids, so the phone and the PC make the same records when each moves the projects. */
export const projectTaskId = (projectId: string) => `task-${projectId}`
const materialTaskId = (projectId: string, index: number) => `task-${projectId}|${index}`

/** A project's last-changed day, or null for the starting ones that were never changed. */
const changedOn = (project: Project) => (project.updatedAt > 0 ? toISODate(new Date(project.updatedAt)) : null)

/**
 * Marks a project as moved. A starting project that was never changed stays unsynced, like
 * the task made from it: every device makes both the same way.
 */
const retire = (project: Project) => db.projects.put({ ...project, deleted: true, updatedAt: project.updatedAt > 0 ? now() : 0 })

/**
 * Turns each project into a task in the Projects list: its notes, kind and link carry over,
 * materials become subtasks, and finished projects go to the archive. The new records keep
 * the project's last-changed time, so a later change to the task, made on any device, wins.
 * Safe to run on every start.
 */
export async function moveProjectsToLists(): Promise<void> {
  await db.transaction('rw', db.projects, db.lists, db.tasks, async () => {
    const projects = alive(await db.projects.toArray()).sort((a, b) => a.order - b.order)
    if (!projects.length) return

    const lists = alive(await db.lists.toArray())
    let list: TaskList | undefined = lists.find((candidate) => candidate.name.trim().toLowerCase() === 'projects')
    if (!list) {
      list = (await db.lists.get(PROJECTS_LIST_ID)) ?? {
        id: PROJECTS_LIST_ID,
        name: 'Projects',
        showOnToday: true,
        order: await nextOrder(db.lists),
        updatedAt: 0,
      }
      // Brings it back if it had been deleted, since there are projects to put in it.
      if (list.deleted) list = { ...list, deleted: false, updatedAt: now() }
      await db.lists.put(list)
    }
    const listId = list.id

    for (const project of projects) {
      const id = projectTaskId(project.id)
      const existing = await db.tasks.get(id)
      // Already moved, and the task has changed since.
      if (existing && existing.updatedAt >= project.updatedAt) {
        await retire(project)
        continue
      }
      const done = project.status === 'done'
      const doneDate = done ? (changedOn(project) ?? toISODate(new Date())) : null
      const notes = [project.kind ? `Kind: ${project.kind}` : '', project.notes].filter(Boolean).join('\n')
      const task: Task = {
        id,
        title: project.name,
        date: null,
        due: null,
        listId,
        parentId: null,
        done,
        doneDate,
        order: project.order,
        notes,
        link: project.link,
        updatedAt: project.updatedAt,
      }
      const subtasks: Task[] = project.materials.map((material, index) => ({
        id: materialTaskId(project.id, index),
        title: material.name,
        date: null,
        due: null,
        listId,
        parentId: id,
        done: material.have,
        doneDate: material.have ? changedOn(project) : null,
        order: index,
        updatedAt: project.updatedAt,
      }))
      await db.tasks.bulkPut([task, ...subtasks])
      await retire(project)
    }
  })
}
