<script lang="ts">
  // Settings (F57): everything you can set up or change, in one place. Some of it can also be
  // changed on its own page; the links go there.
  import { ALL_FEATURES, FEATURE_GROUPS } from '../lib/features'
  import { live } from '../lib/live.svelte'
  import { getFeatures, getTracking, updateFeatures, updateTracking } from '../lib/repo'

  const tracking = live(() => getTracking, { periods: false })
  const features = live(() => getFeatures, ALL_FEATURES)
  const on = $derived(features.current)
</script>

{#snippet link(href: string, label: string, detail: string)}
  <li><a {href}><span class="label">{label}</span><span class="detail">{detail}</span></a></li>
{/snippet}

<header>
  <h1>Settings</h1>
  <p class="date">Everything you set up or change, in one place.</p>
</header>

<section>
  <h2>Your setup</h2>
  <ul class="list more-list">
    {@render link('#/setup', 'Setup', 'Colours, meds, habits, targets, food guidelines, reminder times, backups')}
    {#if on.goals}{@render link('#/goals', 'Goals', 'Add and change goals, their progress lines and targets')}{/if}
  </ul>
</section>

<section>
  <h2>What you use</h2>
  <p class="small">Turn off what you don't use and it's hidden everywhere: Today, Plans, Upcoming, Insights, Me and the reminders. What you logged stays, and comes back if you turn it on again.</p>
  {#each FEATURE_GROUPS as group (group.title)}
    <div class="card padded feature-group">
      <span class="field-label">{group.title}</span>
      {#each group.items as item (item.key)}
        <label class="inline-check feature">
          <input type="checkbox" checked={on[item.key]} onchange={(event) => updateFeatures({ [item.key]: event.currentTarget.checked })} />
          <span class="text">
            <span class="label">{item.label}</span>
            {#if item.detail}<span class="detail">{item.detail}</span>{/if}
          </span>
        </label>
      {/each}
    </div>
  {/each}
</section>

<section>
  <h2>Tracking</h2>
  <div class="card padded">
    <label class="inline-check">
      <input type="checkbox" checked={tracking.current.periods} onchange={(event) => updateTracking({ periods: event.currentTarget.checked })} />
      Track periods
    </label>
    <p class="muted small">Adds a drop next to Energy on Today to mark a period day. Insights shows them on the calendar and compares your energy. No predictions, only the days you mark.</p>
  </div>
</section>

<section>
  <h2>Plans and lists</h2>
  <ul class="list more-list">
    {@render link('#/tracks', 'Tracks', 'Anything you work at: steps, time toward a goal, a weekly focus')}
    {@render link('#/week', 'Your week', 'Activities on each day: tracks and your own')}
    {#if on.exercise}{@render link('#/exercise', 'Exercise plan', 'Blocks, moves and reps, cardio, yoga or pilates')}{/if}
    {@render link('#/routines', 'Routines', 'Add, rename or change how often (the pencil on each)')}
    {@render link('#/lists', 'Lists', 'Your lists and whether they show on Today')}
  </ul>
</section>

{#if on.recipes || on.shopping}
<section>
  <h2>Food and home</h2>
  <ul class="list more-list">
    {#if on.recipes}{@render link('#/recipes', 'Recipes', 'Your go-to meals')}{/if}
    {#if on.shopping}{@render link('#/shopping', 'Shopping', 'Tabs, staples and one-off things')}{/if}
  </ul>
</section>
{/if}

<section>
  <h2>App</h2>
  <ul class="list more-list">
    {@render link('#/sync', 'Sync and reminders', 'Share data between your phone and PC; notifications at your times')}
    {@render link('#/ai', 'AI analysis', 'Export for an AI, analyses you keep, connect Claude (off unless you turn it on)')}
  </ul>
</section>
