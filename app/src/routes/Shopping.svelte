<script lang="ts">
  import type { Project, Staple } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { listProjects, materialsToGet, setMaterialHave } from '../lib/projects'
  import { addStaple, deleteStaple, groupStaples, listStaples, setStapleLow } from '../lib/staples'

  const staples = live(() => listStaples, [] as Staple[])
  const projects = live(() => listProjects, [] as Project[])
  const toBuy = $derived(staples.current.filter((staple) => staple.low))
  const groups = $derived(groupStaples(staples.current))
  const materials = $derived(materialsToGet(projects.current))

  let newName = $state('')
  let newGroup = $state('')

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    await addStaple(name, newGroup.trim() || 'Other')
    newName = ''
  }

  async function remove(staple: Staple) {
    if (window.confirm(`Delete "${staple.name}"?`)) await deleteStaple(staple.id)
  }
</script>

<header>
  <h1>Shopping</h1>
  <p class="date">Things to keep at hand. Tick what's running low and it goes on the list.</p>
</header>

<section>
  <h2>To buy</h2>
  {#if toBuy.length}
    <ul class="list">
      {#each toBuy as staple (staple.id)}
        <li class="row row-line padded">
          <span class="label grow">{staple.name}</span>
          <button type="button" class="button small" onclick={() => setStapleLow(staple.id, false)}>Got it</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted small">Nothing to buy right now.</p>
  {/if}
</section>

{#if materials.length}
  <section>
    <h2>For projects</h2>
    <ul class="list">
      {#each materials as item (`${item.project.id}|${item.index}`)}
        <li class="row row-line padded">
          <span class="text grow">
            <span class="label">{item.material.name}</span>
            <span class="detail">{item.project.name}</span>
          </span>
          <button type="button" class="button small" onclick={() => setMaterialHave(item.project.id, item.index, true)}>Got it</button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#each groups as group (group.group)}
  <section>
    <h2>{group.group}</h2>
    <ul class="list">
      {#each group.items as staple (staple.id)}
        <li class="row row-line">
          <label class="check grow">
            <input type="checkbox" checked={staple.low} onchange={() => setStapleLow(staple.id, !staple.low)} />
            <span class="text">
              <span class="label">{staple.name}</span>
              <span class="detail">{staple.low ? 'running low' : 'at hand'}</span>
            </span>
          </label>
          <button type="button" class="remove" aria-label="Delete {staple.name}" onclick={() => remove(staple)}>×</button>
        </li>
      {/each}
    </ul>
  </section>
{/each}

<section>
  <h2>Add a staple</h2>
  <form class="add-row" onsubmit={submit}>
    <input class="grow" type="text" bind:value={newName} placeholder="Name" aria-label="New staple" />
    <input type="text" list="staple-groups" bind:value={newGroup} placeholder="Group" aria-label="Group" />
    <button type="submit" class="button">Add</button>
  </form>
  <datalist id="staple-groups">
    {#each groups as group (group.group)}<option value={group.group}></option>{/each}
  </datalist>
</section>
