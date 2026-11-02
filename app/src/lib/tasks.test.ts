import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { ensureSeeded } from './repo'
import { addList, addTask, deleteList, deleteTask, getDueTasks, getListTasks, listLists, setTaskDone, updateList } from './tasks'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded()
})

const titles = (tasks: { title: string }[]) => tasks.map((task) => task.title)

describe('task lists', () => {
  it('starts with Life, Work, Vela and Projects, with Vela kept off Today', async () => {
    expect((await listLists()).map((list) => [list.name, list.showOnToday])).toEqual([
      ['Life', true],
      ['Work', true],
      ['Vela', false],
      ['Projects', true],
    ])
  })

  it('nests subtasks under their task and archives done tasks', async () => {
    await addTask('list-life', 'Trip')
    const [trip] = (await getListTasks('list-life')).open
    await addTask('list-life', 'Book tickets', { parentId: trip.id })
    await addTask('list-life', 'Pack', { parentId: trip.id })

    let tasks = await getListTasks('list-life')
    expect(titles(tasks.open)).toEqual(['Trip'])
    expect(titles(tasks.open[0].subtasks)).toEqual(['Book tickets', 'Pack'])

    await setTaskDone(trip.id, true, '2026-11-02')
    tasks = await getListTasks('list-life')
    expect(tasks.open).toEqual([])
    expect(titles(tasks.archived)).toEqual(['Trip'])
  })

  it('shows tasks due on Today, oldest deadline first, but not from lists kept off Today', async () => {
    await addTask('list-life', 'Renew passport', { due: '2026-11-02' })
    await addTask('list-life', 'Later', { due: '2026-11-09' })
    await addTask('list-life', 'Overdue', { due: '2026-10-30' })
    await addTask('list-vela', 'Game goal', { due: '2026-11-02' })

    expect((await getDueTasks('2026-11-02', true)).map((due) => due.task.title)).toEqual(['Overdue', 'Renew passport'])
    // A past day only shows what was due on it.
    expect((await getDueTasks('2026-10-30', false)).map((due) => due.task.title)).toEqual(['Overdue'])
  })

  it('stops showing a list on Today when that is switched off', async () => {
    await addTask('list-work', 'Ship the build', { due: '2026-11-02' })
    await updateList('list-work', { showOnToday: false })
    expect(await getDueTasks('2026-11-02', true)).toEqual([])
  })

  it('deletes a task with its subtasks, and a list with its tasks', async () => {
    await addTask('list-life', 'Trip')
    const [trip] = (await getListTasks('list-life')).open
    await addTask('list-life', 'Pack', { parentId: trip.id })
    await deleteTask(trip.id)
    expect(await db.tasks.filter((task) => !task.deleted && task.listId === 'list-life').count()).toBe(0)

    const id = await addList('Errands')
    await addTask(id, 'Post office')
    await deleteList(id)
    expect((await listLists()).map((list) => list.name)).not.toContain('Errands')
    expect(await db.tasks.filter((task) => !task.deleted && task.listId === id).count()).toBe(0)
  })
})
