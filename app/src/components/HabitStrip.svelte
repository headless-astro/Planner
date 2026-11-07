<script lang="ts">
  // One habit as % of its target, with a bar per week (D66). The week still going is faded and
  // reads "2 of 4, 2 to go" rather than a %, so a Wednesday never looks like a bad week.
  import { formatShort, parseDate } from '../lib/dates'
  import type { HabitRow, HabitWeek } from '../lib/insights'
  import { countText } from '../lib/week'

  let { row, mode }: { row: HabitRow; mode: 'week' | 'average' } = $props()

  const current = $derived(row.weeks[row.weeks.length - 1])
  const finished = $derived(row.weeks.filter((week) => !week.inProgress && (week.percent !== null || week.target === null)))
  const maxCount = $derived(Math.max(1, ...row.weeks.map((week) => week.count)))

  const value = $derived.by(() => {
    if (mode === 'week' || (row.average === null && current.target !== null)) {
      if (current.target === null) return `${countText(current.count)} this week`
      if (current.count >= current.target) return `${countText(current.count)} of ${current.target} · on target`
      return `${countText(current.count)} of ${current.target}, ${countText(current.target - current.count)} to go`
    }
    if (row.average !== null) return `${row.average}%`
    const counted = finished.filter((week) => week.target === null)
    const perWeek = counted.length ? counted.reduce((sum, week) => sum + week.count, 0) / counted.length : 0
    return `${countText(Math.round(perWeek * 2) / 2)} a week`
  })

  /** Bar height in %: by target where there is one (full at 100% and over), else by count. */
  function height(week: HabitWeek): number {
    if (week.target !== null) return week.percent === null ? 0 : Math.min(100, week.percent)
    return (week.count / maxCount) * 100
  }

  function label(week: HabitWeek): string {
    const when = `From ${formatShort(parseDate(week.monday))}${week.inProgress ? ' (this week)' : ''}`
    if (week.target === null) return `${when}: ${countText(week.count)}`
    return week.percent === null ? `${when}: not started yet` : `${when}: ${countText(week.count)} of ${week.target}, ${week.percent}%`
  }
</script>

<li class="habit-strip">
  <div class="habit-head">
    <span class="label">{row.label}</span>
    <span class="habit-value" class:on-target={mode === 'average' ? (row.average ?? 0) >= 100 : current.target !== null && current.count >= current.target}>{value}</span>
  </div>
  <div class="bars" role="img" aria-label="{row.label}, week by week: {row.weeks.map(label).join('; ')}">
    {#each row.weeks as week (week.monday)}
      <span
        class="bar-cell"
        class:now={week.inProgress}
        class:full={week.percent !== null && week.percent >= 100}
        class:blank={week.target !== null && week.percent === null}
        title={label(week)}><span style:height="{Math.max(height(week), week.count ? 6 : 0)}%"></span></span
      >
    {/each}
  </div>
  {#if row.streak >= 2}<span class="detail">On target {row.streak} weeks running</span>{/if}
</li>
