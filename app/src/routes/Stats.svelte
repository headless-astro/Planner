<script lang="ts">
  import WeightChart from '../components/WeightChart.svelte'
  import { formatShort, parseDate } from '../lib/dates'
  import type { Measurement, Topic } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import { getMeasurements } from '../lib/repo'
  import { getStats, type Stats } from '../lib/stats'
  import { listTopics, topicsDone } from '../lib/study'

  let { today }: { today: string } = $props()

  const stats = live(() => () => getStats(today), null as Stats | null)
  const weights = live(() => () => getMeasurements('weight'), [] as Measurement[])
  const topics = live(() => listTopics, [] as Topic[])

  const points = $derived(weights.current.map((row) => ({ date: row.date, value: row.value })))
  const weeks = $derived(stats.current ? [...stats.current.weeks].reverse() : [])
  const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)
</script>

<header>
  <h1>Stats</h1>
  <p class="date">Worked out from everything you've logged.</p>
</header>

{#if stats.current}
  {@const numbers = stats.current}
  <div class="tiles">
    <div class="tile">
      <span class="tile-label">Days logged</span>
      <span class="tile-value">{percent(numbers.logged, numbers.days)}%</span>
      <span class="tile-note">
        {numbers.since ? `${numbers.logged} of ${numbers.days} days since ${formatShort(parseDate(numbers.since))}` : 'Nothing logged yet'}
      </span>
    </div>
    <div class="tile">
      <span class="tile-label">Work</span>
      <span class="tile-value">{numbers.workAverage === null ? '–' : numbers.workAverage.toFixed(1)}</span>
      <span class="tile-note">average out of 3, over {numbers.workDays} rated {numbers.workDays === 1 ? 'day' : 'days'}</span>
    </div>
    <div class="tile">
      <span class="tile-label">Spanish input</span>
      <span class="tile-value">{numbers.spanishHours.toFixed(1)} h</span>
    </div>
    <div class="tile">
      <span class="tile-label">Tech topics</span>
      <span class="tile-value">{topicsDone(topics.current)} of {topics.current.length}</span>
    </div>
  </div>

  <section>
    <h2>Weight</h2>
    <WeightChart {points} />
  </section>

  <section>
    <h2>Last 4 weeks</h2>
    <div class="card table-wrap">
      <table class="numbers">
        <thead>
          <tr>
            <th scope="col">Week of</th>
            {#each weeks as week (week.monday)}<th scope="col">{formatShort(parseDate(week.monday)).slice(4)}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each weeks[0]?.counters ?? [] as counter, row (counter.id)}
            <tr>
              <th scope="row">{counter.label}</th>
              {#each weeks as week (week.monday)}
                {@const cell = week.counters[row]}
                <td>{cell ? `${cell.count}${cell.target !== null ? `/${cell.target}` : ''}` : ''}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="muted small">Days done, out of the week's target. Crunch days come out of the targets.</p>
  </section>
{/if}
