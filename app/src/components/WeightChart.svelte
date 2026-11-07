<script lang="ts">
  import { nearestDot, weightChartLayout, type ChartPoint } from '../lib/chart'
  import { formatDate, formatShort, parseDate } from '../lib/dates'

  // One series (weight) and a reference line (goal pace), so no legend box: the key below
  // names both, and the goal line is dashed and labelled so it never relies on colour.
  // The goal pace comes from your targets (F64); null draws no goal line.
  let { points, pace = null }: { points: ChartPoint[]; pace?: number | null } = $props()

  let width = $state(0)
  let active = $state<number | null>(null)

  const layout = $derived(points.length >= 2 ? weightChartLayout(points, Math.max(width, 280), pace ?? 0) : null)
  const shown = $derived(layout && active !== null ? layout.dots[active] : null)
  const last = $derived(layout ? layout.dots[layout.dots.length - 1] : null)
  const kg = (value: number) => `${value.toFixed(1)} kg`

  function onPointer(event: PointerEvent & { currentTarget: HTMLElement }) {
    if (!layout) return
    const box = event.currentTarget.getBoundingClientRect()
    active = nearestDot(layout.dots, event.clientX - box.left)
  }

  function onKey(event: KeyboardEvent) {
    if (!layout) return
    const lastIndex = layout.dots.length - 1
    const current = active ?? lastIndex
    if (event.key === 'ArrowLeft') active = Math.max(0, current - 1)
    else if (event.key === 'ArrowRight') active = Math.min(lastIndex, current + 1)
    else if (event.key === 'Home') active = 0
    else if (event.key === 'End') active = lastIndex
    else return
    event.preventDefault()
  }
</script>

<div class="card chart" bind:clientWidth={width}>
  <div class="chart-key" aria-hidden="true">
    <span><svg width="20" height="8"><line class="chart-line" x1="1" y1="4" x2="19" y2="4" /></svg>Weight</span>
    {#if pace !== null}
      <span><svg width="20" height="8"><line class="chart-goal" x1="1" y1="4" x2="19" y2="4" /></svg>Goal pace, {pace} kg a week</span>
    {/if}
  </div>

  {#if layout && last}
    <div
      class="chart-plot"
      role="slider"
      tabindex="0"
      aria-label="Weight, {points.length} weigh-ins. Use the arrow keys to read each one."
      aria-valuemin={0}
      aria-valuemax={layout.dots.length - 1}
      aria-valuenow={active ?? layout.dots.length - 1}
      aria-valuetext="{formatShort(parseDate((shown ?? last).date))}: {kg((shown ?? last).value)}"
      onpointermove={onPointer}
      onpointerleave={() => (active = null)}
      onkeydown={onKey}
      onfocus={() => (active = layout ? layout.dots.length - 1 : null)}
      onblur={() => (active = null)}
    >
      <svg width={layout.width} height={layout.height} aria-hidden="true">
        {#each layout.ticks as tick (tick.value)}
          <line class="chart-grid" x1={layout.plot.left} x2={layout.plot.right} y1={tick.y} y2={tick.y} />
          <text class="chart-label" x={layout.plot.left - 8} y={tick.y} text-anchor="end" dominant-baseline="middle">{tick.value}</text>
        {/each}
        {#each layout.xLabels as label (label.anchor)}
          <text class="chart-label" x={label.x} y={layout.height - 8} text-anchor={label.anchor}>{label.text}</text>
        {/each}

        {#if pace !== null}
          <line class="chart-goal" x1={layout.goal.x1} y1={layout.goal.y1} x2={layout.goal.x2} y2={layout.goal.y2} />
          <!-- When the weight is on pace the two end labels would collide; the key above still names the line. -->
          {#if Math.abs(layout.goal.y2 - last.y) >= 16}
            <text class="chart-label" x={layout.goal.x2 + 8} y={layout.goal.y2} dominant-baseline="middle">Goal pace</text>
          {/if}
        {/if}

        <path class="chart-line" d={layout.path} />
        {#if layout.dots.length <= 16}
          {#each layout.dots as dot (dot.date)}<circle class="chart-dot" cx={dot.x} cy={dot.y} r="4" />{/each}
        {:else}
          <circle class="chart-dot" cx={last.x} cy={last.y} r="4" />
        {/if}
        <text class="chart-value" x={last.x + 8} y={last.y} dominant-baseline="middle">{kg(last.value)}</text>

        {#if shown}
          <line class="chart-cross" x1={shown.x} x2={shown.x} y1={layout.plot.top} y2={layout.plot.bottom} />
          <circle class="chart-dot active" cx={shown.x} cy={shown.y} r="5" />
        {/if}
      </svg>

      {#if shown}
        <div class="tooltip" style:left="{shown.x}px" style:top="{shown.y}px">
          <strong>{kg(shown.value)}</strong>
          <span class="muted">{formatShort(parseDate(shown.date))}</span>
          {#if pace !== null}
            <span class="muted"><svg width="14" height="6" aria-hidden="true"><line class="chart-goal" x1="0" y1="3" x2="14" y2="3" /></svg> goal {kg(shown.goal)}</span>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <p class="muted small">The chart starts after two weigh-ins. They go in on Saturdays, on the Today screen.</p>
  {/if}

  {#if layout}
    <details class="steps chart-table">
      <summary>Show as a table</summary>
      <table>
        <thead><tr><th>Date</th><th>kg</th>{#if pace !== null}<th>Goal pace</th>{/if}</tr></thead>
        <tbody>
          {#each [...layout.dots].reverse() as dot (dot.date)}
            <tr><td>{formatDate(parseDate(dot.date))}</td><td>{dot.value.toFixed(1)}</td>{#if pace !== null}<td>{dot.goal.toFixed(1)}</td>{/if}</tr>
          {/each}
        </tbody>
      </table>
    </details>
  {/if}
</div>
