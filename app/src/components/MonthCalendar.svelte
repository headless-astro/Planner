<script lang="ts">
  // A month at a glance (F53): days you logged something are marked, period days get a drop,
  // and tapping a day opens it. Arrows go back and forth a month at a time.
  import Icon from './Icon.svelte'
  import { addDays, parseDate, toISODate, weekStart } from '../lib/dates'

  let { today, logged, periods = [] }: { today: string; logged: readonly string[]; periods?: readonly string[] } = $props()

  // svelte-ignore state_referenced_locally
  let month = $state(today.slice(0, 7))

  const loggedSet = $derived(new Set(logged))
  const periodSet = $derived(new Set(periods))
  const title = $derived(parseDate(`${month}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }))
  const isThisMonth = $derived(month === today.slice(0, 7))

  /** Monday to Sunday rows covering the month; days outside it are null. */
  const rows = $derived.by(() => {
    const first = parseDate(`${month}-01`)
    const cells: (string | null)[] = []
    for (let day = weekStart(first); ; day = addDays(day, 1)) {
      const iso = toISODate(day)
      if (iso.slice(0, 7) > month && cells.length % 7 === 0) break
      cells.push(iso.slice(0, 7) === month ? iso : null)
    }
    return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
  })

  function shift(by: number) {
    const date = parseDate(`${month}-01`)
    date.setMonth(date.getMonth() + by)
    month = toISODate(date).slice(0, 7)
  }
</script>

<div class="card month">
  <div class="month-head">
    <button type="button" class="icon-button pencil" aria-label="Previous month" onclick={() => shift(-1)}><Icon name="caret-left" /></button>
    <span class="month-title">{title}</span>
    <button type="button" class="icon-button pencil" aria-label="Next month" disabled={isThisMonth} onclick={() => shift(1)}><Icon name="caret-right" /></button>
  </div>
  <table class="month-grid">
    <thead>
      <tr>{#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as day, index (index)}<th scope="col">{day}</th>{/each}</tr>
    </thead>
    <tbody>
      {#each rows as row, index (index)}
        <tr>
          {#each row as date, cell (cell)}
            <td>
              {#if date && date <= today}
                <a
                  class="month-day"
                  class:is-today={date === today}
                  class:logged={loggedSet.has(date)}
                  href={date === today ? '#/today' : `#/day/${date}`}
                  aria-label="{parseDate(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}{loggedSet.has(date) ? ', logged' : ''}{periodSet.has(date) ? ', period day' : ''}"
                >
                  {Number(date.slice(8))}
                  {#if periodSet.has(date)}<span class="month-drop"><Icon name="drop-fill" /></span>{/if}
                </a>
              {:else if date}
                <span class="month-day future">{Number(date.slice(8))}</span>
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="muted small month-key">
    <span class="key-dot"></span> logged{#if periods.length}&nbsp;&nbsp;<span class="month-drop"><Icon name="drop-fill" /></span> period{/if}
  </p>
</div>
