<script lang="ts">
  import type { Goal } from '../lib/db'
  import { GOAL_MEASURES, addGoal, deleteGoal, goalTree, listGoals, moveGoal, updateGoal } from '../lib/goals'
  import { live } from '../lib/live.svelte'
  import type { GoalMeasure } from '../lib/setup'

  let { today }: { today: string } = $props()

  const MEASURES = Object.entries(GOAL_MEASURES) as [GoalMeasure, string][]

  const goals = live(() => listGoals, [] as Goal[])
  const tree = $derived(goalTree(goals.current))

  let newGoal = $state('')
  let newChildren = $state<Record<string, string>>({})

  function rename(goal: Goal, text: string) {
    const title = text.trim()
    if (title) void updateGoal(goal.id, { title })
  }

  async function submitGoal(event: SubmitEvent) {
    event.preventDefault()
    const title = newGoal.trim()
    if (!title) return
    await addGoal(title, null)
    newGoal = ''
  }

  async function submitChild(event: SubmitEvent, parentId: string) {
    event.preventDefault()
    const title = (newChildren[parentId] ?? '').trim()
    if (!title) return
    newChildren[parentId] = ''
    await addGoal(title, parentId)
  }
</script>

{#snippet editor(goal: Goal, index: number, count: number, child: boolean)}
  <li class:child>
    <input class="full" type="text" value={goal.title} aria-label={child ? 'Sub-goal' : 'Goal'} onchange={(event) => rename(goal, event.currentTarget.value)} />
    <select
      value={goal.measure ?? ''}
      aria-label="Progress line for {goal.title}"
      onchange={(event) => updateGoal(goal.id, { measure: (event.currentTarget.value || null) as GoalMeasure | null })}
    >
      <option value="">No progress line</option>
      {#each MEASURES as [id, label] (id)}<option value={id}>{label}</option>{/each}
    </select>
    <input
      class="goal-notes"
      type="text"
      value={goal.notes}
      placeholder="Notes"
      aria-label="Notes for {goal.title}"
      onchange={(event) => updateGoal(goal.id, { notes: event.currentTarget.value.trim() })}
    />
    <label class="inline-check">
      <input type="checkbox" checked={!!goal.reached} onchange={(event) => updateGoal(goal.id, { reached: event.currentTarget.checked ? today : null })} />
      Reached
    </label>
    <span class="row-actions">
      <button type="button" class="icon-button" aria-label="Move {goal.title} up" disabled={index === 0} onclick={() => moveGoal(goal.id, -1)}>↑</button>
      <button type="button" class="icon-button" aria-label="Move {goal.title} down" disabled={index === count - 1} onclick={() => moveGoal(goal.id, 1)}>↓</button>
      <button
        type="button"
        class="link danger"
        onclick={() => window.confirm(child ? `Delete "${goal.title}"?` : `Delete "${goal.title}" and its sub-goals?`) && deleteGoal(goal.id)}>Delete</button
      >
    </span>
  </li>
{/snippet}

<header>
  <h1>Goals</h1>
  <p class="date">What the plans are for. Changes save as you go; Me shows them with their progress.</p>
</header>

<p class="muted small">Each goal can show a progress line from what you log.</p>
{#each tree as branch, index (branch.goal.id)}
  <section class="card goal-edit">
    <ul class="edit-list">
      {@render editor(branch.goal, index, tree.length, false)}
      {#each branch.children as child, childIndex (child.id)}
        {@render editor(child, childIndex, branch.children.length, true)}
      {/each}
    </ul>
    <form class="add-row padded" onsubmit={(event) => submitChild(event, branch.goal.id)}>
      <input
        class="grow"
        type="text"
        bind:value={newChildren[branch.goal.id]}
        placeholder="Add a sub-goal"
        aria-label="New sub-goal for {branch.goal.title}"
      />
      <button type="submit" class="button small secondary">Add</button>
    </form>
  </section>
{/each}
<section>
  <h2>New goal</h2>
  <form class="add-row" onsubmit={submitGoal}>
    <input class="grow" type="text" bind:value={newGoal} placeholder="Goal" aria-label="New goal" />
    <button type="submit" class="button">Add</button>
  </form>
</section>
<p class="small"><a href="#/me">See your goals and their progress on Me</a></p>
