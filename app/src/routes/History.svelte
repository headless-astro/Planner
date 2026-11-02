<script lang="ts">
  import { addDays, formatDate, formatShort, parseDate, toISODate } from '../lib/dates'
  import type { Measurement } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { getDaySummaries, getMeasurements, type DaySummary } from '../lib/repo'

  let { today }: { today: string } = $props()

  let weeks = $state(4)

  const summaries = live(() => {
    const from = toISODate(addDays(parseDate(today), -(weeks * 7 - 1)))
    const to = today
    return () => getDaySummaries(from, to)
  }, [] as DaySummary[])
  const weights = live(() => () => getMeasurements('weight'), [] as Measurement[])
  const waists = live(() => () => getMeasurements('waist'), [] as Measurement[])

  function pills(day: DaySummary): string[] {
    const shown: string[] = []
    if (day.crunch) shown.push('Crunch day')
    if (day.ticks) shown.push(`${day.ticks} ${day.ticks === 1 ? 'tick' : 'ticks'}`)
    if (day.routinesDone) shown.push(`${day.routinesDone} ${day.routinesDone === 1 ? 'routine' : 'routines'} done`)
    if (day.todosDone) shown.push(`${day.todosDone} ${day.todosDone === 1 ? 'task' : 'tasks'} done`)
    if (day.work) shown.push(`Work ${day.work}`)
    if (day.rules) shown.push(day.rules === 'kept' ? 'Rules kept' : 'Rules: slip')
    if (day.snackKcal) shown.push(`Snacks ${day.snackKcal} kcal`)
    if (day.weight) shown.push(`${day.weight} kg`)
    if (day.wrote) shown.push('Notes')
    return shown
  }

  /** +1.2 / −0.8 / ±0.0 */
  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(1)}`

  /** Newest first, each with the change since the one before it. */
  function withChanges(rows: Measurement[]) {
    return rows.map((row, index) => ({ ...row, change: index > 0 ? row.value - rows[index - 1].value : null })).reverse()
  }
</script>

<header>
  <h1>History</h1>
  <p class="date">Tap a day to see or change it.</p>
</header>

<section>
  <h2>Days</h2>
  <ul class="list history">
    {#each summaries.current as day (day.date)}
      {@const shown = pills(day)}
      <li>
        <a href="#/day/{day.date}">
          <span class="when">{day.date === today ? 'Today' : formatShort(parseDate(day.date))}</span>
          {#if shown.length}
            {#each shown as pill (pill)}<span class="pill">{pill}</span>{/each}
          {:else}
            <span class="empty">Nothing logged</span>
          {/if}
        </a>
      </li>
    {/each}
  </ul>
  <button type="button" class="button secondary more" onclick={() => (weeks += 4)}>Show 4 more weeks</button>
</section>

{#snippet measurements(rows: Measurement[], unit: string, empty: string)}
  {#if rows.length}
    {#if rows.length > 1}
      <p class="small">{signed(rows[rows.length - 1].value - rows[0].value)} {unit} since {formatDate(parseDate(rows[0].date))}</p>
    {/if}
    <div class="card table-wrap">
      <table>
        <thead>
          <tr><th>Date</th><th>{unit}</th><th>Change</th></tr>
        </thead>
        <tbody>
          {#each withChanges(rows) as row (row.id)}
            <tr>
              <td><a href="#/day/{row.date}">{formatShort(parseDate(row.date))}</a></td>
              <td>{row.value}</td>
              <td>{row.change === null ? '' : signed(row.change)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <p class="muted small">{empty}</p>
  {/if}
{/snippet}

<section>
  <h2>Weigh-ins</h2>
  {@render measurements(weights.current, 'kg', 'No weigh-ins yet. They go in on Saturdays, on the Today screen.')}
</section>

<section>
  <h2>Waist</h2>
  {@render measurements(waists.current, 'cm', 'No waist measurements yet. Add one next to a Saturday weigh-in every few weeks.')}
</section>
