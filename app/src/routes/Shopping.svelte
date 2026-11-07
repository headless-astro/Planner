<script lang="ts">
  // Shopping (F60): To buy first (everything needed, from every tab), then Food and any tabs you
  // make. Staples stay and get ticked when they run low; one-off things go away once bought.
  import AddToggle from '../components/AddToggle.svelte'
  import type { Staple } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { FOOD_TAB, addStaple, deleteStaple, gotIt, groupStaples, isToBuy, listStaples, setStapleLow, shoppingTabs, tabOf } from '../lib/staples'

  const staples = live(() => listStaples, [] as Staple[])

  const TO_BUY = 'to-buy'
  const TAB_KEY = 'shopping-tab'
  const NEW_TAB = '__new-tab__'

  function savedTab(): string {
    try {
      return localStorage.getItem(TAB_KEY) ?? TO_BUY
    } catch {
      return TO_BUY
    }
  }

  const tabs = $derived(shoppingTabs(staples.current))
  let picked = $state(savedTab())
  const tab = $derived(picked === TO_BUY || tabs.includes(picked) ? picked : TO_BUY)

  function pick(value: string) {
    picked = value
    try {
      localStorage.setItem(TAB_KEY, value)
    } catch {
      // Not remembered, which is fine.
    }
  }

  const toBuy = $derived(staples.current.filter(isToBuy))
  const inTab = $derived(staples.current.filter((staple) => tabOf(staple) === tab))
  const keptHere = $derived(groupStaples(inTab.filter((staple) => !staple.oneOff)))
  const onceHere = $derived(inTab.filter((staple) => staple.oneOff))
  const groupNames = $derived([...new Set(staples.current.filter((staple) => !staple.oneOff).map((staple) => staple.group))])

  // Adding, behind +: to the tab you're on (Food from To buy), or a new tab.
  let adding = $state(false)
  let newName = $state('')
  let newGroup = $state('')
  let newTabChoice = $state('')
  let newTabName = $state('')
  let newOneOff = $state(false)
  const tabChoice = $derived(newTabChoice || (tab === TO_BUY ? FOOD_TAB : tab))

  function openNewTab() {
    adding = true
    newTabChoice = NEW_TAB
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    const name = newName.trim()
    const target = tabChoice === NEW_TAB ? newTabName.trim() : tabChoice
    if (!name || !target) return
    await addStaple(name, newGroup.trim() || (newOneOff ? 'This time' : 'Other'), { tab: target, oneOff: newOneOff })
    newName = ''
    newGroup = ''
    if (tabChoice === NEW_TAB) {
      newTabChoice = ''
      newTabName = ''
      if (tab !== TO_BUY) pick(target)
    }
  }

  async function remove(staple: Staple) {
    if (window.confirm(`Delete "${staple.name}"?`)) await deleteStaple(staple.id)
  }
</script>

<header class="with-add">
  <div>
    <h1>Shopping</h1>
    <p class="date">Tick what's running low and it goes on To buy. One-off things go away once you've got them.</p>
  </div>
  <AddToggle bind:open={adding} label="Add something" />
</header>

{#if adding}
  <section>
    <h2>Add something</h2>
    <form class="edit-panel card padded" onsubmit={submit}>
      <label>Name <input type="text" bind:value={newName} placeholder="e.g. Oats, or a phone charger" aria-label="New item" /></label>
      <label>
        Tab
        <select value={tabChoice} onchange={(event) => (newTabChoice = event.currentTarget.value)} aria-label="Tab">
          {#each tabs as name (name)}<option value={name}>{name}</option>{/each}
          <option value={NEW_TAB}>New tab…</option>
        </select>
      </label>
      {#if tabChoice === NEW_TAB}
        <label>New tab <input type="text" bind:value={newTabName} placeholder="e.g. Home" aria-label="New tab name" /></label>
      {/if}
      <label>Group <input type="text" list="staple-groups" bind:value={newGroup} placeholder="Optional, e.g. Fridge" aria-label="Group" /></label>
      <label class="inline-check">
        <input type="checkbox" bind:checked={newOneOff} />
        Just this once (it goes away once you've got it)
      </label>
      <button type="submit" class="button">Add</button>
    </form>
  </section>
{/if}

<div class="chips list-tabs" role="group" aria-label="Shopping tabs">
  <button type="button" class="chip" aria-pressed={tab === TO_BUY} onclick={() => pick(TO_BUY)}>To buy{toBuy.length ? ` ${toBuy.length}` : ''}</button>
  {#each tabs as name (name)}
    <button type="button" class="chip" aria-pressed={tab === name} onclick={() => pick(name)}>{name}</button>
  {/each}
  <button type="button" class="chip" aria-label="Add a tab" onclick={openNewTab}>+</button>
</div>

{#if tab === TO_BUY}
  <section class="area-list">
    {#if toBuy.length}
      <ul class="list">
        {#each toBuy as staple (staple.id)}
          <li class="row row-line padded">
            <span class="text grow">
              <span class="label">{staple.name}</span>
              <span class="detail">{tabOf(staple)}{staple.oneOff ? ' · just this once' : ''}</span>
            </span>
            <button type="button" class="button small" onclick={() => gotIt(staple)}>Got it</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted small">Nothing to buy right now.</p>
    {/if}
  </section>
{:else}
  {#if onceHere.length}
    <section>
      <h2>Just this once</h2>
      <ul class="list">
        {#each onceHere as staple (staple.id)}
          <li class="row row-line padded">
            <span class="label grow">{staple.name}</span>
            <button type="button" class="button small" onclick={() => gotIt(staple)}>Got it</button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#each keptHere as group (group.group)}
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
  {:else}
    {#if !onceHere.length}<p class="muted small area-list">Nothing on {tab} yet. Tap + to add something.</p>{/if}
  {/each}
{/if}

<datalist id="staple-groups">
  {#each groupNames as group (group)}<option value={group}></option>{/each}
</datalist>
