<script lang="ts">
  // Insights (F53): History and Stats in one tab. Wins first, then habits as % of their
  // targets, what's slipping, health, the smaller numbers, and a way to look back.
  import HabitStrip from '../components/HabitStrip.svelte'
  import MonthCalendar from '../components/MonthCalendar.svelte'
  import WeightChart from '../components/WeightChart.svelte'
  import { formatShort, parseDate } from '../lib/dates'
  import type { Measurement } from '../lib/db'
  import { PERIODS, getInsights, type Insights, type Period } from '../lib/insights'
  import { live } from '../lib/live.svelte'
  import { SHELVES, type Shelf } from '../lib/media'

  let { today }: { today: string } = $props()

  const PERIOD_KEY = 'insights-period'
  function savedPeriod(): Period {
    try {
      const value = localStorage.getItem(PERIOD_KEY)
      return PERIODS.some((period) => period.id === value) ? (value as Period) : 'month'
    } catch {
      return 'month'
    }
  }
  let period = $state<Period>(savedPeriod())
  function choose(value: Period) {
    period = value
    try {
      localStorage.setItem(PERIOD_KEY, value)
    } catch {
      // Not remembered, which is fine.
    }
  }

  const insights = live(() => {
    const chosen = period
    const day = today
    return () => getInsights(day, chosen)
  }, null as Insights | null)

  const span = $derived(
    period === 'week'
      ? 'this week'
      : period === 'month'
        ? 'the last 4 weeks'
        : period === 'quarter'
          ? 'the last 3 months'
          : insights.current?.overall.since
            ? `since ${formatShort(parseDate(insights.current.overall.since))}`
            : 'so far',
  )

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)
  /** +1.2 / −0.8 / ±0.0 */
  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(1)}`
  /** Newest first, each with the change since the one before it. */
  const withChanges = (rows: Measurement[]) =>
    rows.map((row, index) => ({ ...row, change: index > 0 ? row.value - rows[index - 1].value : null })).reverse()
</script>

{#snippet tile(label: string, value: string, note: string = '')}
  <div class="tile">
    <span class="tile-label">{label}</span>
    <span class="tile-value">{value}</span>
    {#if note}<span class="tile-note">{note}</span>{/if}
  </div>
{/snippet}

{#snippet reviewCard(done: boolean, notes: boolean)}
  <a class="card review-card" href="#/review">
    <span class="text grow">
      <span class="label">This week's review</span>
      <span class="detail">{done ? 'Done ✓' : notes ? 'Started' : 'Not done yet'} · older weeks are a tap away inside</span>
    </span>
    <span class="chevron" aria-hidden="true">›</span>
  </a>
{/snippet}

{#snippet measurements(rows: Measurement[], unit: string, summary: string)}
  {#if rows.length}
    <details class="card measure-list">
      <summary>{summary}</summary>
      <div class="table-wrap">
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
    </details>
  {/if}
{/snippet}

<header>
  <h1>Insights</h1>
  <p class="date">How things are going, worked out from what you log.</p>
</header>

<div class="seg period-seg" role="group" aria-label="Period">
  {#each PERIODS as option (option.id)}
    <button type="button" aria-pressed={period === option.id} onclick={() => choose(option.id)}>{option.label}</button>
  {/each}
</div>

{#if insights.current}
  {@const data = insights.current}
  {@const health = data.health}
  {@const on = data.features}

  {#if period === 'week'}
    <section class="review-top">{@render reviewCard(data.review.done, data.review.notes)}</section>
  {/if}

  <section>
    <h2>Going well</h2>
    {#if data.wins.length}
      <ul class="card plain insight-list wins">
        {#each data.wins as win (win)}<li>{win}</li>{/each}
      </ul>
    {:else}
      <p class="muted small">Nothing to show yet. Log a few days and this fills in.</p>
    {/if}
  </section>

  <section>
    <h2>Habits</h2>
    <ul class="card plain habit-list">
      {#each data.habits as row (row.id)}<HabitStrip {row} mode={period === 'week' ? 'week' : 'average'} />{/each}
    </ul>
    <p class="muted small">
      {period === 'week' ? 'This week so far.' : `Average over ${span}, as % of each target.`} One bar per week; this week is the faded one. Crunch days
      lower the target.
    </p>
  </section>

  <section>
    <h2>What's slipping</h2>
    {#if data.slipping.length}
      <ul class="card plain insight-list slipping">
        {#each data.slipping as slip (slip.text)}<li><a href={slip.href}>{slip.text}</a></li>{/each}
      </ul>
      <p class="muted small">Only things that have held on for a while: 2 weeks under target, or well past due.</p>
    {:else}
      <p class="muted small">Nothing slipping.</p>
    {/if}
  </section>

  <section>
    <h2>Health</h2>
    <div class="tiles">
      {#if on.body}
      {@render tile(
        'Weight',
        health.weights.length ? `${health.weights[health.weights.length - 1].value} kg` : '–',
        health.weightTrend ?? (health.weights.length ? `Last on ${formatShort(parseDate(health.weights[health.weights.length - 1].date))}` : 'Weigh-ins go in on Saturdays'),
      )}
      {@render tile(
        'Waist',
        health.waists.length ? `${health.waists[health.waists.length - 1].value} cm` : '–',
        health.waistTrend ?? (health.waists.length ? `Last on ${formatShort(parseDate(health.waists[health.waists.length - 1].date))}` : 'Next to a Saturday weigh-in'),
      )}
      {/if}
      {#if on.exercise}{@render tile('Workouts', `${health.workouts.done} of ${health.workouts.planned}`, `workout days, ${span}`)}{/if}
      {#if health.meds.of}{@render tile('Meds', `${percent(health.meds.done, health.meds.of)}%`, `${health.meds.done} of ${health.meds.of} doses ticked`)}{/if}
      {#if on.food}
      {@render tile(
        'Food guidelines',
        `${health.eating.mostly} mostly`,
        `${health.eating.partly} partly · ${health.eating.notReally} not really`,
      )}
      {/if}
      {#if on.energy}
      {@render tile(
        'Energy',
        health.energy.average === null ? '–' : `${health.energy.average.toFixed(1)}`,
        health.energy.days ? `average of 3, over ${plural(health.energy.days, 'day')}` : 'Rate it on Today',
      )}
      {/if}
      {#if health.periodDays !== null}
        {@render tile('Period days', String(health.periodDays), span)}
      {/if}
    </div>
    {#if health.energyByPeriod}
      <p class="small">Energy on period days: {health.energyByPeriod.period.toFixed(1)}, other days: {health.energyByPeriod.other.toFixed(1)}.</p>
    {/if}
    {#if on.body}
      {#if health.weights.length >= 2}
        <WeightChart points={health.weights.map((row) => ({ date: row.date, value: row.value }))} pace={data.weeklyLoss} />
      {/if}
      {@render measurements(health.weights, 'kg', `All weigh-ins (${health.weights.length})`)}
      {@render measurements(health.waists, 'cm', `All waist measurements (${health.waists.length})`)}
    {/if}
  </section>

  <section>
    <h2>More numbers</h2>
    <div class="tiles">
      {#if on.work}
      {@render tile(
        'Work',
        data.work.average === null ? '–' : data.work.average.toFixed(1),
        data.work.days ? `average of 3, ${plural(data.work.days, 'rated day')}${data.work.nothing ? ` · ${data.work.nothing} with nothing done` : ''}` : 'No ratings yet',
      )}
      {/if}
      {@render tile('Days logged', `${percent(data.overall.logged, data.overall.days)}%`, `${data.overall.logged} of ${plural(data.overall.days, 'day')}, ${span}`)}
      {#each data.tracks as track (track.id)}
        {@render tile(
          track.name,
          track.hours !== null ? `${track.hours} h` : track.stepsTotal ? `${track.stepsDone} of ${track.stepsTotal}` : plural(track.sessions, 'day'),
          [
            track.hours !== null ? `${track.hoursInPeriod} h ${span}${track.milestone ? ` · ${track.milestone}` : ''}` : '',
            track.stepsTotal ? `${plural(track.stepsInPeriod, 'step')} ${span}` : '',
            track.hours !== null || track.stepsTotal ? `${plural(track.sessions, 'day')} ${span}` : span,
          ]
            .filter(Boolean)
            .join(' · '),
        )}
      {/each}
      {@render tile('Routines', `${data.routines.done} done`, data.routines.tracked ? `${data.routines.onTime} of ${data.routines.tracked} kept to their schedule` : span)}
      {@render tile('Tasks', `${data.tasks.done} done`, `${data.tasks.perWeek} a week${data.tasks.late ? ` · ${data.tasks.late} late now` : ''}`)}
      {@render tile(
        'Finished',
        String((Object.values(data.freeTime.finished) as number[]).reduce((sum, n) => sum + n, 0)),
        (Object.keys(SHELVES) as Shelf[])
          .filter((shelf) => data.freeTime.finished[shelf])
          .map((shelf) => `${data.freeTime.finished[shelf]} ${SHELVES[shelf].title.toLowerCase()}`)
          .join(' · ') || `nothing ${span}`,
      )}
      {#if data.freeTime.movieStars !== null || data.freeTime.rated}
        {@render tile(
          'Enjoyed',
          data.freeTime.rated ? `${data.freeTime.liked} of ${data.freeTime.rated}` : `${data.freeTime.movieStars?.toFixed(1)} ★`,
          [data.freeTime.rated ? 'books, games and shows with a thumb up' : '', data.freeTime.movieStars !== null && data.freeTime.rated ? `movies ${data.freeTime.movieStars.toFixed(1)} ★` : '']
            .filter(Boolean)
            .join(' · ') || 'movies, average stars',
        )}
      {/if}
    </div>
  </section>

  <section>
    <h2>Look back</h2>
    {#if period !== 'week'}{@render reviewCard(data.review.done, data.review.notes)}{/if}
    <MonthCalendar {today} logged={data.loggedDates} periods={data.periodDates} />
  </section>
{/if}
