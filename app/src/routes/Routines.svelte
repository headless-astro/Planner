<script lang="ts">
  import AddToggle from '../components/AddToggle.svelte'
  import Icon from '../components/Icon.svelte'
  import { formatShort, parseDate } from '../lib/dates'
  import { live } from '../lib/live.svelte'
  import { addRoutine, deleteRoutine, dueText, getRoutineStatuses, setRoutineDone, updateRoutine, type RoutineStatus } from '../lib/routines'
  import { CHORES_AREA } from '../lib/setup'

  let { today }: { today: string } = $props()

  const statuses = live(() => () => getRoutineStatuses(today), [] as RoutineStatus[])

  const groups = $derived.by(() => {
    const byArea = new Map<string, RoutineStatus[]>()
    for (const status of statuses.current) byArea.set(status.routine.area, [...(byArea.get(status.routine.area) ?? []), status])
    return [...byArea].map(([area, items]) => ({ area, items }))
  })

  // ── Tabs (F50): Due first, then each area. The last one opened is kept on this device. ──
  const DUE = 'due'
  const TAB_KEY = 'routines-tab'
  const isDue = (status: RoutineStatus) => !status.doneThatDay && status.dueIn !== null && status.dueIn <= 0

  function savedTab(): string {
    try {
      return localStorage.getItem(TAB_KEY) ?? DUE
    } catch {
      return DUE
    }
  }

  let picked = $state(savedTab())
  // A remembered area that's gone (renamed or emptied) falls back to Due.
  const tab = $derived(picked === DUE || groups.some((group) => group.area === picked) ? picked : DUE)

  function pick(value: string) {
    picked = value
    try {
      localStorage.setItem(TAB_KEY, value)
    } catch {
      // Private windows can refuse storage; the tab still changes.
    }
  }

  /** Due today or late, most late first; ones done today stay at the end so Undo is at hand. */
  const dueItems = $derived(
    statuses.current
      .filter((status) => isDue(status) || status.doneThatDay)
      .sort((a, b) => Number(a.doneThatDay) - Number(b.doneThatDay) || (a.dueIn ?? 0) - (b.dueIn ?? 0)),
  )
  const dueCount = $derived(statuses.current.filter(isDue).length)
  const shown = $derived(tab === DUE ? dueItems : (groups.find((group) => group.area === tab)?.items ?? []))

  // When a routine is due is what matters most, so it gets a coloured pill; editing hides behind a pencil.
  function dueTone(status: RoutineStatus): 'done' | 'late' | 'today' | 'soon' | 'later' | 'new' {
    if (status.doneThatDay) return 'done'
    if (status.dueIn === null) return 'new'
    if (status.dueIn < 0) return 'late'
    if (status.dueIn === 0) return 'today'
    return status.dueIn <= 2 ? 'soon' : 'later'
  }
  let editing = $state<string | null>(null)

  // ── Adding (F50): behind +, with the area picked from yours or a new one. ──
  const NEW_AREA = '__new-area__'
  let adding = $state(false)
  let newName = $state('')
  let newInterval = $state<number | null>(7)
  let newAreaChoice = $state('')
  let newArea = $state('')
  const areaChoice = $derived(
    newAreaChoice || (tab !== DUE ? tab : (groups[0]?.area ?? NEW_AREA)),
  )
  let doneOn = $state<Record<string, string>>({})

  const confirmDelete = (name: string) => window.confirm(`Delete "${name}"?`)
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  function history(status: RoutineStatus): string {
    if (!status.lastDone) return 'Not done yet'
    const last = `Last done ${formatShort(parseDate(status.lastDone))}`
    const times = plural(status.count, 'time')
    return status.averageGap === null ? `${last} · ${times}` : `${last} · ${times}, about every ${plural(Math.round(status.averageGap), 'day')}`
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    const name = newName.trim()
    const interval = Math.round(Number(newInterval))
    if (!name || !Number.isFinite(interval) || interval < 1) return
    const area = areaChoice === NEW_AREA ? newArea.trim() : areaChoice
    if (!area) return
    await addRoutine(name, area, interval)
    newName = ''
    newArea = ''
    newAreaChoice = ''
    adding = false
    pick(area)
  }

  async function saveDoneOn(event: SubmitEvent, routineId: string) {
    event.preventDefault()
    const date = doneOn[routineId]
    if (!date || date > today) return
    await setRoutineDone(routineId, date, true)
    doneOn[routineId] = ''
  }
</script>

<header class="with-add">
  <div>
    <h1>Routines</h1>
    <p class="date">Things that repeat every few days, counted from the last time you did them.</p>
  </div>
  <AddToggle bind:open={adding} label="Add a routine" />
</header>

{#if adding}
  <section>
    <h2>New routine</h2>
    <form class="edit-panel card padded" onsubmit={submit}>
      <label>Name <input type="text" bind:value={newName} placeholder="e.g. Water the plants" aria-label="New routine name" /></label>
      <label class="inline">
        Every
        <input type="number" min="1" bind:value={newInterval} aria-label="Every how many days" />
        days
      </label>
      <label>
        Area
        <select value={areaChoice} onchange={(event) => (newAreaChoice = event.currentTarget.value)} aria-label="Area">
          {#each groups as group (group.area)}<option value={group.area}>{group.area}</option>{/each}
          <option value={NEW_AREA}>New area…</option>
        </select>
      </label>
      {#if areaChoice === NEW_AREA}
        <label>New area <input type="text" bind:value={newArea} placeholder="e.g. Garden" aria-label="New area name" /></label>
      {/if}
      <button type="submit" class="button">Add routine</button>
    </form>
    <p class="muted small">Routines in the {CHORES_AREA} area also tick Chores for the day.</p>
  </section>
{/if}

<div class="chips list-tabs" role="group" aria-label="Areas">
  <button type="button" class="chip" aria-pressed={tab === DUE} onclick={() => pick(DUE)}>Due{dueCount ? ` ${dueCount}` : ''}</button>
  {#each groups as group (group.area)}
    {@const count = group.items.filter(isDue).length}
    <button type="button" class="chip" aria-pressed={tab === group.area} onclick={() => pick(group.area)}>{group.area}{count ? ` ${count}` : ''}</button>
  {/each}
</div>

<section class="area-list">
  {#if shown.length}
    <ul class="list">
      {#each shown as status (status.routine.id)}
        <li class="row">
          <div class="routine-head">
            <span class="text grow">
              <span class="label">{status.routine.name}</span>
              <span class="due-pill {dueTone(status)}">{status.doneThatDay && status.dueIn !== null ? `done · next in ${plural(status.dueIn, 'day')}` : dueText(status)}</span>
              <span class="detail">
                {tab === DUE ? `${status.routine.area} · ` : ''}every {plural(status.routine.intervalDays, 'day')} · {history(status)}
              </span>
            </span>
            <div class="routine-actions">
              <button
                type="button"
                class="button small"
                class:secondary={status.doneThatDay}
                onclick={() => setRoutineDone(status.routine.id, today, !status.doneThatDay)}
              >
                {status.doneThatDay ? 'Undo' : 'Done today'}
              </button>
              <button
                type="button"
                class="icon-button pencil"
                aria-label="Edit {status.routine.name}"
                title="Edit"
                aria-expanded={editing === status.routine.id}
                onclick={() => (editing = editing === status.routine.id ? null : status.routine.id)}><Icon name="pencil" /></button
              >
            </div>
          </div>
          {#if editing === status.routine.id}
            <div class="edit-panel routine-edit">
              <form class="add-row" onsubmit={(event) => saveDoneOn(event, status.routine.id)}>
                <label>
                  Done on
                  <input
                    type="date"
                    max={today}
                    value={doneOn[status.routine.id] ?? ''}
                    oninput={(event) => (doneOn[status.routine.id] = event.currentTarget.value)}
                  />
                </label>
                <button type="submit" class="button small">Save</button>
              </form>
              <label>
                Name
                <input
                  type="text"
                  value={status.routine.name}
                  onchange={(event) => {
                    const name = event.currentTarget.value.trim()
                    if (name) void updateRoutine(status.routine.id, { name })
                  }}
                />
              </label>
              <label>
                Every how many days
                <input
                  type="number"
                  min="1"
                  value={status.routine.intervalDays}
                  onchange={(event) => {
                    const days = Math.round(Number(event.currentTarget.value))
                    if (days >= 1) void updateRoutine(status.routine.id, { intervalDays: days })
                  }}
                />
              </label>
              <label>
                Area
                <input
                  type="text"
                  list="routine-areas"
                  value={status.routine.area}
                  onchange={(event) => {
                    const area = event.currentTarget.value.trim()
                    if (area) void updateRoutine(status.routine.id, { area })
                  }}
                />
              </label>
              <button type="button" class="link danger" onclick={() => confirmDelete(status.routine.name) && deleteRoutine(status.routine.id)}
                >Delete routine</button
              >
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if tab === DUE}
    <p class="muted small">Nothing due or late right now.</p>
  {:else}
    <p class="muted small">No routines in {tab}.</p>
  {/if}
</section>

<datalist id="routine-areas">
  {#each groups as group (group.area)}<option value={group.area}></option>{/each}
</datalist>

