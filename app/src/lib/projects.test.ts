import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { listCooked, listRecipes, setCooked } from './recipes'
import {
  addMaterial,
  deleteProject,
  listCraftLogs,
  listProjects,
  materialsToGet,
  removeMaterial,
  setMaterialHave,
  setWorkedOn,
  updateProject,
} from './projects'
import { ensureSeeded, getDayValues } from './repo'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeeded()
})

const frog = async () => (await listProjects()).find((project) => project.id === 'project-frog')

describe('craft projects', () => {
  it('start with the three from the spreadsheet', async () => {
    expect((await listProjects()).map((project) => `${project.name} (${project.kind})`)).toEqual([
      'Frog (Crochet)',
      'Heart Bag (Crochet)',
      'Flower Dice (Dice)',
    ])
  })

  it('put the materials you still need on the shopping list', async () => {
    await addMaterial('project-frog', 'Green yarn')
    await addMaterial('project-frog', 'Safety eyes')
    await addMaterial('project-frog', 'Stuffing')
    await setMaterialHave('project-frog', 0, true)
    await removeMaterial('project-frog', 2)
    expect((await frog())?.materials).toEqual([
      { name: 'Green yarn', have: true },
      { name: 'Safety eyes', have: false },
    ])
    expect(materialsToGet(await listProjects()).map((item) => item.material.name)).toEqual(['Safety eyes'])

    await updateProject('project-frog', { status: 'done' })
    expect(materialsToGet(await listProjects())).toEqual([])
  })

  it('working on one ticks Crafts and starts it; undoing clears the tick', async () => {
    await setWorkedOn('project-frog', '2026-11-02', true)
    expect((await frog())?.status).toBe('active')
    expect((await getDayValues('2026-11-02'))['tick:crafts']).toBe(true)

    await setWorkedOn('project-frog', '2026-11-02', false)
    expect(await listCraftLogs()).toEqual([])
    expect((await getDayValues('2026-11-02'))['tick:crafts']).toBe(false)
  })

  it('keeps Crafts ticked while another project was worked on that day', async () => {
    await setWorkedOn('project-frog', '2026-11-02', true)
    await setWorkedOn('project-heart-bag', '2026-11-02', true)
    await setWorkedOn('project-frog', '2026-11-02', false)
    expect((await getDayValues('2026-11-02'))['tick:crafts']).toBe(true)
  })

  it('deleting a project removes its log too', async () => {
    await setWorkedOn('project-frog', '2026-11-02', true)
    await deleteProject('project-frog')
    expect(await frog()).toBeUndefined()
    expect(await listCraftLogs()).toEqual([])
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
