<script lang="ts">
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

  let newName = $state('')
  let newInterval = $state<number | null>(7)
  let newArea = $state('')
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
    await addRoutine(name, newArea.trim() || 'Other', interval)
    newName = ''
    newArea = ''
  }

  async function saveDoneOn(event: SubmitEvent, routineId: string) {
    event.preventDefault()
    const date = doneOn[routineId]
    if (!date || date > today) return
    await setRoutineDone(routineId, date, true)
    doneOn[routineId] = ''
  }
</script>

<header>
  <h1>Routines</h1>
  <p class="date">Things that repeat every few days, counted from the last time you did them.</p>
</header>

{#each groups as group (group.area)}
  <section>
    <h2>{group.area}</h2>
    <ul class="list">
      {#each group.items as status (status.routine.id)}
        <li class="row">
          <div class="routine-head">
            <span class="text grow">
              <span class="label">{status.routine.name}</span>
              <span class="detail" class:late={status.dueIn !== null && status.dueIn < 0 && !status.doneThatDay}>
                every {plural(status.routine.intervalDays, 'day')} · {dueText(status)}
              </span>
              <span class="detail">{history(status)}</span>
            </span>
            <button
              type="button"
              class="button small"
              class:secondary={status.doneThatDay}
              onclick={() => setRoutineDone(status.routine.id, today, !status.doneThatDay)}
            >
              {status.doneThatDay ? 'Undo' : 'Done today'}
            </button>
          </div>
          <details class="steps">
            <summary>Edit</summary>
            <div class="edit-panel">
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
          </details>
        </li>
      {/each}
    </ul>
  </section>
{/each}

<datalist id="routine-areas">
  {#each groups as group (group.area)}<option value={group.area}></option>{/each}
</datalist>

<section>
  <h2>New routine</h2>
  <form class="add-row" onsubmit={submit}>
    <input class="grow" type="text" bind:value={newName} placeholder="Name" aria-label="New routine name" />
    <label class="inline">
      every
      <input type="number" min="1" bind:value={newInterval} aria-label="Every how many days" />
      days
    </label>
    <input type="text" list="routine-areas" bind:value={newArea} placeholder="Area" aria-label="Area" />
    <button type="submit" class="button">Add</button>
  </form>
  <p class="muted small">Routines in the {CHORES_AREA} area also tick Chores for the day.</p>
</section>
