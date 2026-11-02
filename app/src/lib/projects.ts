// Craft projects (PLAN.md 1.8, S19, F17): status, materials, a link and notes. Working on one
// ticks Crafts for the day (F5), and materials you don't have yet go on the shopping list.
import { db, type CraftLog, type Material, type Project } from './db'
import { setEntry } from './repo'
import { alive, listOrdered, newId, nextOrder, now, softDelete, update } from './store'

export const PROJECT_STATUS: Record<Project['status'], string> = { idea: 'Not started', active: 'In progress', done: 'Finished' }

export const listProjects = () => listOrdered(db.projects)

export async function addProject(name: string, kind: string): Promise<void> {
  await db.projects.put({
    id: newId(),
    name,
    kind,
    status: 'idea',
    link: '',
    materials: [],
    notes: '',
    order: await nextOrder(db.projects),
    updatedAt: now(),
  })
}

export const updateProject = (id: string, changes: Partial<Pick<Project, 'name' | 'kind' | 'status' | 'link' | 'notes'>>) =>
  update(db.projects, id, changes)

/** Deletes a project with its log. */
export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.craftLogs, async () => {
    await softDelete(db.projects, id)
    for (const log of alive(await db.craftLogs.where('projectId').equals(id).toArray())) await softDelete(db.craftLogs, log.id)
  })
}

// Materials are edited on the stored copy of the project, so what's saved is always plain data
// and two quick edits can't overwrite each other.
async function editMaterials(projectId: string, edit: (materials: Material[]) => Material[]): Promise<void> {
  await db.transaction('rw', db.projects, async () => {
    const project = await db.projects.get(projectId)
    if (project) await db.projects.put({ ...project, materials: edit(project.materials), updatedAt: now() })
  })
}

export const addMaterial = (projectId: string, name: string) => editMaterials(projectId, (materials) => [...materials, { name, have: false }])
export const setMaterialHave = (projectId: string, index: number, have: boolean) =>
  editMaterials(projectId, (materials) => materials.map((material, i) => (i === index ? { ...material, have } : material)))
export const removeMaterial = (projectId: string, index: number) =>
  editMaterials(projectId, (materials) => materials.filter((_, i) => i !== index))

export interface MaterialToGet {
  project: Project
  material: Material
  index: number
}

/** Materials still to get for projects that aren't finished. They show on the shopping list. */
export function materialsToGet(projects: readonly Project[]): MaterialToGet[] {
  return projects
    .filter((project) => project.status !== 'done')
    .flatMap((project) => project.materials.flatMap((material, index) => (material.have ? [] : [{ project, material, index }])))
}

/** Newest first. */
export async function listCraftLogs(): Promise<CraftLog[]> {
  return alive(await db.craftLogs.toArray()).sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Logs working on a project on a date, or undoes it. Working on it ticks Crafts and moves a
 * project that hadn't started to "in progress". Undoing clears Crafts unless another project
 * was worked on that day.
 */
export async function setWorkedOn(projectId: string, date: string, done: boolean): Promise<void> {
  const id = `${projectId}|${date}`
  if (!done) {
    await softDelete(db.craftLogs, id)
    const others = alive(await db.craftLogs.where('date').equals(date).toArray())
    if (!others.length) await setEntry(date, 'tick:crafts', false)
    return
  }
  await db.craftLogs.put({ id, projectId, date, updatedAt: now() })
  const project = await db.projects.get(projectId)
  if (project?.status === 'idea') await updateProject(projectId, { status: 'active' })
  await setEntry(date, 'tick:crafts', true)
}
