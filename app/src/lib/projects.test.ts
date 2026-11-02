import { beforeEach, describe, expect, it } from 'vitest'
import { db, type Project } from './db'
import { PROJECTS_LIST_ID, moveProjectsToLists, projectTaskId } from './projects'
import { listCooked, listRecipes, setCooked } from './recipes'
import { ensureSeeded, getDayValues } from './repo'
import { addList, getListTasks, listLists, updateTask } from './tasks'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded()
})

const titles = (tasks: { title: string }[]) => tasks.map((task) => task.title)

/** A craft project as the M5 Projects screen saved it. */
function oldProject(changes: Partial<Project> & { id: string; name: string }): Project {
  return { kind: '', status: 'idea', link: '', materials: [], notes: '', order: 10, updatedAt: Date.UTC(2026, 10, 1, 12), ...changes }
}

describe('projects move into Lists (M7)', () => {
  it('the three starting projects become tasks in a new Projects list', async () => {
    const lists = await listLists()
    expect(lists.at(-1)).toMatchObject({ id: PROJECTS_LIST_ID, name: 'Projects', showOnToday: true })
    const { open } = await getListTasks(PROJECTS_LIST_ID)
    expect(titles(open)).toEqual(['Frog', 'Heart Bag', 'Flower Dice'])
    expect(open[0].notes).toBe('Kind: Crochet')
    expect(await db.projects.filter((project) => !project.deleted).count()).toBe(0)
  })

  it('carries over notes, the link and materials, and archives finished ones', async () => {
    await db.projects.bulkPut([
      oldProject({
        id: 'p1',
        name: 'Tote bag',
        kind: 'Sewing',
        status: 'active',
        link: 'https://example.com/pattern',
        notes: 'Lined, with a pocket',
        materials: [
          { name: 'Canvas', have: true },
          { name: 'Thread', have: false },
        ],
      }),
      oldProject({ id: 'p2', name: 'Scarf', status: 'done' }),
    ])
    await moveProjectsToLists()

    const { open, archived } = await getListTasks(PROJECTS_LIST_ID)
    const tote = open.find((task) => task.title === 'Tote bag')
    expect(tote).toMatchObject({ notes: 'Kind: Sewing\nLined, with a pocket', link: 'https://example.com/pattern' })
    expect(tote?.subtasks.map((task) => [task.title, task.done])).toEqual([
      ['Canvas', true],
      ['Thread', false],
    ])
    expect(titles(archived)).toEqual(['Scarf'])
    expect(archived[0].doneDate).toBe('2026-11-01')
  })

  it('uses a list you already called "Projects"', async () => {
    await db.lists.delete(PROJECTS_LIST_ID)
    const mine = await addList('projects')
    await db.projects.put(oldProject({ id: 'p1', name: 'Lamp' }))
    await moveProjectsToLists()
    expect(titles((await getListTasks(mine)).open)).toEqual(['Lamp'])
  })

  it('runs once per project: a change made to the task afterwards is kept', async () => {
    await updateTask(projectTaskId('project-frog'), { title: 'Frog plushie' })
    await moveProjectsToLists()
    await ensureSeeded()
    const open = titles((await getListTasks(PROJECTS_LIST_ID)).open)
    expect(open).toContain('Frog plushie')
    expect(open).not.toContain('Frog')
  })
})

describe('recipes, undo', () => {
  it('"Undo" clears Cooked again unless another recipe was cooked that day', async () => {
    const [first, second] = await listRecipes()
    await setCooked(first.id, '2026-11-02', true)
    await setCooked(second.id, '2026-11-02', true)
    await setCooked(first.id, '2026-11-02', false)
    expect((await getDayValues('2026-11-02'))['tick:cooked']).toBe(true)
    await setCooked(second.id, '2026-11-02', false)
    expect(await listCooked()).toEqual([])
    expect((await getDayValues('2026-11-02'))['tick:cooked']).toBe(false)
  })
})
