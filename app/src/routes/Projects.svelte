<script lang="ts">
  import { formatShort, parseDate } from '../lib/dates'
  import type { CraftLog, Project } from '../lib/db'
  import { safeLink } from '../lib/links'
  import { live } from '../lib/live.svelte'
  import {
    PROJECT_STATUS,
    addMaterial,
    addProject,
    deleteProject,
    listCraftLogs,
    listProjects,
    removeMaterial,
    setMaterialHave,
    setWorkedOn,
    updateProject,
  } from '../lib/projects'

  let { today }: { today: string } = $props()

  const STATUSES = ['active', 'idea', 'done'] as const

  const projects = live(() => listProjects, [] as Project[])
  const logs = live(() => listCraftLogs, [] as CraftLog[])

  const groups = $derived(
    STATUSES.map((status) => ({ status, items: projects.current.filter((project) => project.status === status) })).filter((group) => group.items.length),
  )
  const kinds = $derived([...new Set(projects.current.map((project) => project.kind).filter(Boolean))])

  const logsOf = (id: string) => logs.current.filter((log) => log.projectId === id)
  const workedToday = (id: string) => logsOf(id).some((log) => log.date === today)

  function summary(project: Project): string {
    const days = logsOf(project.id)
    const worked = days.length ? `worked on ${days.length} ${days.length === 1 ? 'day' : 'days'}, last ${formatShort(parseDate(days[0].date))}` : ''
    return [project.kind, PROJECT_STATUS[project.status], worked].filter(Boolean).join(' · ')
  }

  let newName = $state('')
  let newKind = $state('')
  let newMaterials = $state<Record<string, string>>({})

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    await addProject(name, newKind.trim())
    newName = ''
  }

  async function submitMaterial(event: SubmitEvent, projectId: string) {
    event.preventDefault()
    const name = (newMaterials[projectId] ?? '').trim()
    if (!name) return
    newMaterials[projectId] = ''
    await addMaterial(projectId, name)
  }
</script>

<header>
  <h1>Craft projects</h1>
  <p class="date">Crochet, dice and anything else you make.</p>
</header>

{#each groups as group (group.status)}
  <section>
    <h2>{PROJECT_STATUS[group.status]}</h2>
    {#each group.items as project (project.id)}
      <div class="card track">
        <h3 class="track-title">{project.name}</h3>
        <p class="small">{summary(project)}</p>
        {#if project.notes}<p class="small pre">{project.notes}</p>{/if}
        {#if safeLink(project.link)}
          <p class="small"><a href={safeLink(project.link)} target="_blank" rel="noopener noreferrer">Open the link</a></p>
        {/if}

        {#if project.materials.length}
          <p class="mini-label">Materials</p>
          <ul class="plain materials">
            {#each project.materials as material, index (index)}
              <li>
                <label class="inline-check grow">
                  <input type="checkbox" checked={material.have} onchange={() => setMaterialHave(project.id, index, !material.have)} />
                  <span class:muted={material.have}>{material.name}</span>
                </label>
                <button type="button" class="remove" aria-label="Remove {material.name}" onclick={() => removeMaterial(project.id, index)}>×</button>
              </li>
            {/each}
          </ul>
        {/if}

        {#if project.status !== 'done'}
          <form class="add-row" onsubmit={(event) => submitMaterial(event, project.id)}>
            <input class="grow" type="text" bind:value={newMaterials[project.id]} placeholder="Add a material" aria-label="New material for {project.name}" />
            <button type="submit" class="button small secondary">Add</button>
          </form>
          {#if project.materials.some((material) => !material.have)}
            <p class="muted small">Tick what you have. The rest is on the shopping list.</p>
          {/if}
          <div class="actions">
            <button
              type="button"
              class="button small"
              class:secondary={workedToday(project.id)}
              onclick={() => setWorkedOn(project.id, today, !workedToday(project.id))}
            >
              {workedToday(project.id) ? 'Undo' : 'Worked on it today'}
            </button>
          </div>
        {/if}

        <details class="steps">
          <summary>Edit project</summary>
          <div class="edit-panel">
            <label>
              Name
              <input
                type="text"
                value={project.name}
                onchange={(event) => {
                  const name = event.currentTarget.value.trim()
                  if (name) void updateProject(project.id, { name })
                }}
              />
            </label>
            <label>
              Kind
              <input type="text" list="project-kinds" value={project.kind} onchange={(event) => updateProject(project.id, { kind: event.currentTarget.value.trim() })} />
            </label>
            <label>
              Status
              <select value={project.status} onchange={(event) => updateProject(project.id, { status: event.currentTarget.value as Project['status'] })}>
                {#each STATUSES as status (status)}<option value={status}>{PROJECT_STATUS[status]}</option>{/each}
              </select>
            </label>
            <label>
              Link (a pattern, a video, photos)
              <input type="url" value={project.link} onchange={(event) => updateProject(project.id, { link: event.currentTarget.value.trim() })} />
            </label>
            <label>
              Notes
              <textarea rows="3" value={project.notes} onchange={(event) => updateProject(project.id, { notes: event.currentTarget.value })}></textarea>
            </label>
            <button type="button" class="link danger" onclick={() => window.confirm(`Delete "${project.name}"?`) && deleteProject(project.id)}>
              Delete project
            </button>
          </div>
        </details>
      </div>
    {/each}
  </section>
{/each}

<datalist id="project-kinds">
  {#each kinds as kind (kind)}<option value={kind}></option>{/each}
</datalist>

<section>
  <h2>New project</h2>
  <form class="add-row" onsubmit={submit}>
    <input class="grow" type="text" bind:value={newName} placeholder="Name" aria-label="New project" />
    <input type="text" list="project-kinds" bind:value={newKind} placeholder="Kind, e.g. Crochet" aria-label="Kind" />
    <button type="submit" class="button">Add</button>
  </form>
  <p class="muted small">"Worked on it today" also ticks Crafts for the day.</p>
</section>
