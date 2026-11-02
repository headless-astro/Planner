<script lang="ts">
  // The goal tree with progress lines, read only (Me tab). Goals are changed in Settings.
  import { formatDate, parseDate } from '../lib/dates'
  import type { Goal } from '../lib/db'
  import { getGoalProgress, goalTree, listGoals, type GoalProgress } from '../lib/goals'
  import { live } from '../lib/live.svelte'
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
</script>

{#snippet progressLine(goal: Goal)}
  {@const line = goal.measure ? progress.current[goal.measure] : undefined}
  {#if line}<a class="goal-progress" href={line.href}>{line.text}</a>{/if}
{/snippet}

{#snippet reached(goal: Goal)}
  {#if goal.reached}<span class="badge">Reached {formatDate(parseDate(goal.reached))}</span>{/if}
{/snippet}
{#each tree as branch (branch.goal.id)}
  <section class="card track goal" class:is-reached={!!branch.goal.reached}>
    <h2 class="track-title">{branch.goal.title}</h2>
    {@render reached(branch.goal)}
    {#if branch.goal.notes}<p class="small">{branch.goal.notes}</p>{/if}
    {@render progressLine(branch.goal)}
    {#if branch.children.length}
      <ul class="plain goal-children">
        {#each branch.children as child (child.id)}
          <li class:is-reached={!!child.reached}>
            <span class="label">{child.title}</span>
            {@render reached(child)}
            {#if child.notes}<span class="detail">{child.notes}</span>{/if}
            {@render progressLine(child)}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{:else}
  <p class="muted small">No goals yet.</p>
{/each}
