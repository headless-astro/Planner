<script lang="ts">
  // The goal tree on Me (F58): each goal's progress is the big number, with a bar when the goal
  // has a target. Goals are changed in Settings → Goals.
  import { formatDate, parseDate } from '../lib/dates'
  import type { Goal, Track } from '../lib/db'
  import { getGoalProgress, goalPercent, goalTree, listGoals, measureTrack, targetMeaning, type GoalProgress } from '../lib/goals'
  import { listTracks } from '../lib/tracks'
  import { ALL_FEATURES, type Feature } from '../lib/features'
  import { live } from '../lib/live.svelte'
  import { getFeatures } from '../lib/repo'
  import type { GoalMeasure } from '../lib/setup'

  let { today }: { today: string } = $props()

  const goals = live(() => listGoals, [] as Goal[])
  const progress = live(
    () => {
      const day = today
      return () => getGoalProgress(day)
    },
    {} as Partial<Record<GoalMeasure, GoalProgress>>,
  )
  const tree = $derived(goalTree(goals.current))
  const features = live(() => getFeatures, ALL_FEATURES)
  const tracks = live(() => listTracks, [] as Track[])
  /** Fixed progress lines follow their part of the app (F63); a track's needs the track. */
  const MEASURE_FEATURE: Partial<Record<GoalMeasure, Feature>> = { weight: 'body', fitness: 'exercise', 'food-rules': 'food', reading: 'books' }
  const measureOn = (measure: GoalMeasure) => {
    const track = measureTrack(measure)
    if (track) return tracks.current.some((candidate) => candidate.id === track)
    const feature = MEASURE_FEATURE[measure]
    return !feature || features.current[feature]
  }
</script>

{#snippet progressBlock(goal: Goal, big: boolean)}
  {@const line = goal.measure && measureOn(goal.measure) ? progress.current[goal.measure] : undefined}
  {@const percent = goalPercent(goal.target, line)}
  {#if line}
    <a class="goal-progress" class:big href={line.href}>
      <span class="goal-value">{line.value}</span>
      <span class="goal-text">{line.text}</span>
    </a>
    {#if percent !== null && goal.measure}
      <div class="goal-bar" role="img" aria-label="{percent}% of the way to {goal.target} {targetMeaning(goal.measure, tracks.current)}">
        <div style:width="{percent}%"></div>
      </div>
      <span class="detail">{percent}% of the way to {goal.target} {targetMeaning(goal.measure, tracks.current)}</span>
    {/if}
  {/if}
{/snippet}

{#snippet reached(goal: Goal)}
  {#if goal.reached}<span class="badge">Reached {formatDate(parseDate(goal.reached))}</span>{/if}
{/snippet}

{#each tree as branch (branch.goal.id)}
  <section class="card track goal" class:is-reached={!!branch.goal.reached}>
    <h2 class="track-title">{branch.goal.title}</h2>
    {@render reached(branch.goal)}
    {@render progressBlock(branch.goal, true)}
    {#if branch.goal.notes}<p class="small">{branch.goal.notes}</p>{/if}
    {#if branch.children.length}
      <ul class="plain goal-children">
        {#each branch.children as child (child.id)}
          <li class:is-reached={!!child.reached}>
            <span class="label">{child.title}</span>
            {@render reached(child)}
            {@render progressBlock(child, false)}
            {#if child.notes}<span class="detail">{child.notes}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{:else}
  <p class="muted small">No goals yet.</p>
{/each}
