<script lang="ts">
  // The Me tab (F35): health, exercise, goals and food at a glance. Nothing is set up here;
  // that's in Settings.
  import GoalList from '../components/GoalList.svelte'
  import Icon, { type IconName } from '../components/Icon.svelte'
  import WeightChart from '../components/WeightChart.svelte'
  import { formatShort, parseDate } from '../lib/dates'
  import type { Measurement, Recipe, Staple } from '../lib/db'
  import { getHealthSummary, type HealthSummary, type MeasureSummary, type Tally } from '../lib/health'
  import { live } from '../lib/live.svelte'
  import { buildDay, primerWeek } from '../lib/plan'
  import { listRecipes } from '../lib/recipes'
  import { getMeasurements, getWeek } from '../lib/repo'
  import { PRIMER_WEEKS, type DayTemplate } from '../lib/setup'
  import { listStaples } from '../lib/staples'
  import { nextDayWhere, dayLabel } from '../lib/summary'

  let { today }: { today: string } = $props()

  const health = live(
    () => {
      const day = today
      return () => getHealthSummary(day)
    },
    null as HealthSummary | null,
  )
  const weights = live(() => () => getMeasurements('weight'), [] as Measurement[])
  const week = live<DayTemplate[] | null>(() => getWeek, null)
  const recipes = live(() => listRecipes, [] as Recipe[])
  const staples = live(() => listStaples, [] as Staple[])

  const points = $derived(weights.current.map((row) => ({ date: row.date, value: row.value })))
  const toBuy = $derived(staples.current.filter((staple) => staple.low).length)

  // Exercise: where the block is, and today's or the next workout.
  const primer = $derived(primerWeek(parseDate(today)))
  const todayWorkout = $derived(
    week.current ? (buildDay(parseDate(today), { week: week.current }).morning.find((item) => item.id === 'workout') ?? null) : null,
  )
  const nextWorkout = $derived.by(() => {
    if (!week.current || todayWorkout) return null
    const date = nextDayWhere(week.current, today, (day) => day.workout !== 'rest')
    return date ? dayLabel(date, today) : null
  })

  /** "−1.2" / "+0.4" / "±0.0" */
  const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(1)}`
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
</script>

{#snippet measure(label: string, summary: MeasureSummary | null, unit: string, empty: string)}
  <div class="tile">
    <span class="tile-label">{label}</span>
    {#if summary}
      <span class="tile-value">{summary.latest.value} {unit}</span>
      <span class="tile-note">
        {formatShort(parseDate(summary.latest.date))}{summary.change !== null
          ? ` · ${signed(summary.change)} since ${formatShort(parseDate(summary.since))}`
          : ''}
      </span>
    {:else}
      <span class="tile-value">–</span>
      <span class="tile-note">{empty}</span>
    {/if}
  </div>
{/snippet}

{#snippet tally(label: string, value: Tally, note: string)}
  <div class="tile">
    <span class="tile-label">{label}</span>
    <span class="tile-value">{value.done} of {value.of}</span>
    <span class="tile-note">{note}</span>
  </div>
{/snippet}

{#snippet link(icon: IconName, text: string, detail: string, href: string)}
  <li>
    <a class="icon-row" {href}>
      <Icon name={icon} />
      <span class="text grow">
        <span class="label">{text}</span>
        <span class="detail">{detail}</span>
      </span>
      <span class="chevron" aria-hidden="true">›</span>
    </a>
  </li>
{/snippet}

<header>
  <h1>Me</h1>
  <p class="date">Your health, exercise, goals and food at a glance. Setup lives in Settings.</p>
</header>

<section>
  <h2>Health</h2>
  {#if health.current}
    {@const numbers = health.current}
    <div class="tiles">
      {@render measure('Weight', numbers.weight, 'kg', 'Weigh-ins go in on Saturdays')}
      {@render measure('Waist', numbers.waist, 'cm', 'Next to a Saturday weigh-in')}
      {@render tally('Workouts', numbers.workouts, 'this week')}
      {@render tally('Meds', numbers.meds, 'doses this week so far')}
      {@render tally('Food rules kept', numbers.foodRules, 'days this week so far')}
    </div>
  {/if}
  {#if points.length >= 2}
    <div class="me-chart">
      <WeightChart {points} />
    </div>
  {/if}
</section>

<section>
  <h2>Exercise</h2>
  <ul class="list more-list">
    {@render link(
      'barbell',
      'Exercise plan',
      primer < 1 ? 'Primer 2 starts soon' : primer > PRIMER_WEEKS ? 'Primer 2 is finished' : `Primer 2 · week ${primer} of ${PRIMER_WEEKS}`,
      '#/exercise',
    )}
  </ul>
  {#if todayWorkout}
    <p class="small">Today: {todayWorkout.label.replace('Workout → ', '')}</p>
  {:else if week.current}
    <p class="small muted">Rest day today{nextWorkout ? `. Next workout: ${nextWorkout}` : ''}.</p>
  {/if}
</section>

<section>
  <h2>Goals</h2>
  <GoalList {today} />
  <p class="small muted">Change them in <a href="#/goals">Settings → Goals</a>.</p>
</section>

<section>
  <h2>Food</h2>
  <ul class="list more-list">
    {@render link('notebook', 'Recipes', plural(recipes.current.length, 'recipe'), '#/recipes')}
    {@render link('notepad', 'Shopping', toBuy ? `${toBuy} to buy` : 'Nothing to buy right now', '#/shopping')}
  </ul>
</section>
