<script lang="ts">
  // The Me tab (F35, F58): health first, then shortcuts to the exercise plan, shopping and
  // recipes, then your goals, shown big. Nothing is set up here; that's in Settings.
  import GoalList from '../components/GoalList.svelte'
  import Icon, { type IconName } from '../components/Icon.svelte'
  import WeightChart from '../components/WeightChart.svelte'
  import { formatShort, parseDate } from '../lib/dates'
  import type { Measurement, Recipe, Staple } from '../lib/db'
  import { DEFAULT_EXERCISE, blockText } from '../lib/exercise'
  import { ALL_FEATURES } from '../lib/features'
  import { getHealthSummary, type HealthSummary, type MeasureSummary, type Tally } from '../lib/health'
  import { live } from '../lib/live.svelte'
  import { buildDay } from '../lib/plan'
  import { listRecipes } from '../lib/recipes'
  import { getExercise, getFeatures, getMeasurements, getTargets, getWeek } from '../lib/repo'
  import { DEFAULT_TARGETS, type DayTemplate } from '../lib/setup'
  import { isToBuy, listStaples } from '../lib/staples'
  import { dayLabel, nextDayWhere } from '../lib/summary'
  import { countText } from '../lib/week'

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
  const exercise = live(() => getExercise, DEFAULT_EXERCISE)
  const recipes = live(() => listRecipes, [] as Recipe[])
  const staples = live(() => listStaples, [] as Staple[])
  const features = live(() => getFeatures, ALL_FEATURES)
  const targets = live(() => getTargets, DEFAULT_TARGETS)
  const on = $derived(features.current)

  const points = $derived(weights.current.map((row) => ({ date: row.date, value: row.value })))
  const toBuy = $derived(staples.current.filter(isToBuy).length)

  // Today's workout from the active block, or when the next one is.
  const todayWorkout = $derived(
    week.current
      ? (buildDay(parseDate(today), { week: week.current, exercise: exercise.current, features: features.current }).morning.find(
          (item) => item.id === 'workout',
        ) ?? null)
      : null,
  )
  const nextWorkout = $derived.by(() => {
    if (!week.current || todayWorkout) return null
    const date = nextDayWhere(week.current, today, (day) => day.workout !== 'rest')
    return date ? dayLabel(date, today) : null
  })

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  /** "↓ 0.6 kg since Sat 31 Oct", against the one before the latest. */
  function stepText(summary: MeasureSummary, unit: string): string {
    if (summary.step === null || !summary.previous) return `on ${formatShort(parseDate(summary.latest.date))}`
    const since = `since ${formatShort(parseDate(summary.previous))}`
    if (Math.abs(summary.step) < 0.05) return `no change ${since}`
    return `${summary.step < 0 ? '↓' : '↑'} ${Math.abs(summary.step).toFixed(1)} ${unit} ${since}`
  }
</script>

{#snippet measure(label: string, summary: MeasureSummary | null, unit: string, empty: string)}
  <a class="tile tile-link" href="#/insights" aria-label="{label}: see the trend in Insights">
    <span class="tile-label">{label}</span>
    {#if summary}
      <span class="tile-value">{summary.latest.value} {unit}</span>
      <span class="tile-note" class:down={(summary.step ?? 0) < 0} class:up={(summary.step ?? 0) > 0}>{stepText(summary, unit)}</span>
    {:else}
      <span class="tile-value">–</span>
      <span class="tile-note">{empty}</span>
    {/if}
  </a>
{/snippet}

{#snippet tally(label: string, value: Tally, note: string)}
  <div class="tile">
    <span class="tile-label">{label}</span>
    <span class="tile-value">{countText(value.done)} of {value.of}</span>
    <span class="tile-note">{note}</span>
  </div>
{/snippet}

{#snippet shortcut(icon: IconName, label: string, detail: string, href: string)}
  <a class="card shortcut" {href}>
    <Icon name={icon} />
    <span class="label">{label}</span>
    <span class="detail">{detail}</span>
  </a>
{/snippet}

<header>
  <h1>Me</h1>
  <p class="date">Your health first, then exercise, shopping, recipes and your goals. Setup lives in Settings.</p>
</header>

<section>
  <h2>Health</h2>
  {#if health.current}
    {@const numbers = health.current}
    <div class="tiles">
      {#if on.body}
        {@render measure('Weight', numbers.weight, 'kg', 'Weigh-ins go in on Saturdays')}
        {@render measure('Waist', numbers.waist, 'cm', 'Next to a Saturday weigh-in')}
      {/if}
      {#if on.exercise}{@render tally('Workouts', numbers.workouts, 'this week')}{/if}
      {#if numbers.meds.of}{@render tally('Meds', numbers.meds, 'doses this week so far')}{/if}
      {#if on.food}{@render tally('Food guidelines', numbers.foodRules, 'days mostly followed so far')}{/if}
      {#if on.energy}
        <div class="tile">
          <span class="tile-label">Energy</span>
          <span class="tile-value">{numbers.energy === null ? '–' : numbers.energy.toFixed(1)}</span>
          <span class="tile-note">{numbers.energy === null ? 'Rate it on Today' : 'average this week, out of 3'}</span>
        </div>
      {/if}
    </div>
  {/if}
  {#if on.body && points.length >= 2}
    <div class="me-chart">
      <WeightChart {points} pace={targets.current.weeklyLoss ?? null} />
    </div>
  {/if}
  <p class="small"><a href="#/insights">See the trends in Insights →</a></p>
</section>

<section>
  {#if on.exercise || on.shopping || on.recipes}
    <div class="shortcuts">
      {#if on.exercise}{@render shortcut('barbell', 'Exercise', blockText(exercise.current, today), '#/exercise')}{/if}
      {#if on.shopping}{@render shortcut('notepad', 'Shopping', toBuy ? `${toBuy} to buy` : 'Nothing to buy', '#/shopping')}{/if}
      {#if on.recipes}{@render shortcut('notebook', 'Recipes', plural(recipes.current.length, 'recipe'), '#/recipes')}{/if}
    </div>
  {/if}
  {#if on.exercise}
    {#if todayWorkout}
      <p class="small">Today's workout: {todayWorkout.label.replace('Workout → ', '')}</p>
    {:else if week.current}
      <p class="small muted">Rest day today{nextWorkout ? `. Next workout: ${nextWorkout}` : ''}.</p>
    {/if}
  {/if}
</section>

{#if on.goals}
  <section>
    <h2>Goals</h2>
    <GoalList {today} />
    <p class="small muted">Change them, or give one a target, in <a href="#/goals">Settings → Goals</a>.</p>
  </section>
{/if}
