<script lang="ts">
  // The Upcoming sub-tab (F47): everything in the next 14 days as one list, late things first.
  // The date shows once for each day; tapping it opens that day.
  import PlansNav from '../components/PlansNav.svelte'
  import { formatShort, parseDate } from '../lib/dates'
  import { live } from '../lib/live.svelte'
  import { getUpcoming, type Upcoming, type UpcomingItem } from '../lib/upcoming'

  let { today }: { today: string } = $props()

  const upcoming = live(() => {
    const day = today
    return () => getUpcoming(day)
  }, null as Upcoming | null)

  const days = $derived(upcoming.current?.days.filter((day) => day.items.length) ?? [])
  const when = (date: string, label: string) => (label === 'Today' || label === 'Tomorrow' ? label : formatShort(parseDate(date)))
</script>

{#snippet itemLink(item: UpcomingItem)}
  <a class="up-item {item.kind}" href={item.href}>
    <span class="text">
      <span class="label">{item.title}</span>
      {#if item.detail}<span class="detail">{item.detail}</span>{/if}
    </span>
  </a>
{/snippet}

<PlansNav current="upcoming" />

<header>
  <h1>Upcoming</h1>
  <p class="date">The next 2 weeks: routines, deadlines, to-dos, and tracks that run for some weeks. What repeats every week is on the Week screen. Tap a date to open that day.</p>
</header>

{#if upcoming.current}
  {#if upcoming.current.late.length || days.length}
    <ul class="card plain up-list">
      {#each upcoming.current.late as item, index (item.id)}
        <li class="up-row" class:new-day={index === 0}>
          <span class="up-when late-when">{index === 0 ? 'Late' : ''}</span>
          {@render itemLink(item)}
        </li>
      {/each}
      {#each days as day (day.date)}
        {#each day.items as item, index (item.id)}
          <li class="up-row" class:new-day={index === 0} class:is-today={day.date === today}>
            {#if index === 0}
              <a class="up-when" href={day.date === today ? '#/today' : `#/day/${day.date}`}>{when(day.date, day.label)}</a>
            {:else}
              <span class="up-when"></span>
            {/if}
            {@render itemLink(item)}
          </li>
        {/each}
      {/each}
    </ul>
  {:else}
    <p class="muted small">Nothing coming up in the next 2 weeks.</p>
  {/if}
{/if}
