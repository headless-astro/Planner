<script lang="ts">
  // The whole exercise block on one page (F35), reached from Me. The week's workout days come
  // from your week, so they follow changes made on the Week screen.
  import { WEEKDAYS, addDays, formatShort, parseDate } from '../lib/dates'
  import { live } from '../lib/live.svelte'
  import { primerWeek } from '../lib/plan'
  import { getWeek } from '../lib/repo'
  import {
    CARDIO,
    LONG_CARDIO,
    PRIMER_START,
    PRIMER_WEEKS,
    STRENGTH_MOVES,
    STRENGTH_ROUNDS,
    WARM_UP,
    WORKOUTS,
    YOGA_TIPS,
    type DayTemplate,
  } from '../lib/setup'

  let { today }: { today: string } = $props()

  const week = live<DayTemplate[] | null>(() => getWeek, null)
  const current = $derived(primerWeek(parseDate(today)))
  const weekNumbers = Array.from({ length: PRIMER_WEEKS }, (_, i) => i + 1)
  const end = formatShort(addDays(parseDate(PRIMER_START), PRIMER_WEEKS * 7 - 1))
</script>

<header>
  <h1>Exercise plan</h1>
  <p class="date">
    Primer 2 · {formatShort(parseDate(PRIMER_START))} – {end} ·
    {current < 1 ? 'not started yet' : current > PRIMER_WEEKS ? 'finished' : `week ${current} of ${PRIMER_WEEKS}`}
  </p>
</header>

<section>
  <h2>Your week</h2>
  {#if week.current}
    <ul class="list">
      {#each week.current as day, index (index)}
        <li class="row row-line padded">
          <span class="plan-day">{WEEKDAYS[index]}</span>
          <span class="small">{WORKOUTS[day.workout]}</span>
        </li>
      {/each}
    </ul>
    <p class="muted small">Change the days on the <a href="#/week">Week</a> screen.</p>
  {/if}
</section>

<section>
  <h2>How it works</h2>
  <ul class="card padded-list small">
    <li>Mornings are best. {WARM_UP}.</li>
    <li>Missed one? Don't double up: do the next day's session as planned.</li>
    <li>If a week felt too hard, repeat it instead of moving on.</li>
    <li>On a hard day, one round of the circuit, 10 minutes of cardio or 10 minutes of yoga counts as done.</li>
  </ul>
</section>

<section>
  <h2>Strength</h2>
  <p class="small">Pick dumbbells you could lift about 15 times and stop at the number listed. When the last reps feel easy, go a little heavier. Rest 60–90 s between rounds.</p>
  <div class="card table-wrap">
    <table class="exercise">
      <thead>
        <tr>
          <th scope="col">Move</th>
          {#each weekNumbers as number (number)}<th scope="col" class:is-now={number === current}>Wk {number}</th>{/each}
        </tr>
      </thead>
      <tbody>
        {#each STRENGTH_MOVES as move (move.name)}
          <tr>
            <th scope="row">{move.name}</th>
            {#each move.reps as reps, index (index)}<td class:is-now={index + 1 === current}>{reps}</td>{/each}
          </tr>
        {/each}
        <tr>
          <th scope="row">Rounds</th>
          {#each STRENGTH_ROUNDS as rounds, index (index)}<td class:is-now={index + 1 === current}>{rounds}</td>{/each}
        </tr>
      </tbody>
    </table>
  </div>
</section>

<section>
  <h2>Cardio</h2>
  <p class="small">A brisk walk outside, or the elliptical when the weather's bad. On the elliptical, "brisk" means a faster pace or more resistance.</p>
  <div class="card table-wrap">
    <table class="exercise">
      <thead>
        <tr>
          <th scope="col"></th>
          {#each weekNumbers as number (number)}<th scope="col" class:is-now={number === current}>Wk {number}</th>{/each}
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Cardio</th>
          {#each CARDIO as text, index (index)}<td class:is-now={index + 1 === current}>{text}</td>{/each}
        </tr>
        <tr>
          <th scope="row">Longer cardio</th>
          {#each LONG_CARDIO as text, index (index)}<td class:is-now={index + 1 === current}>{text}</td>{/each}
        </tr>
      </tbody>
    </table>
  </div>
  <p class="muted small">Longer cardio can be badminton instead.</p>
</section>

<section>
  <h2>Yoga or pilates</h2>
  <p class="small">30 minutes, kept easy on the wrists:</p>
  <ul class="card padded-list small">
    {#each YOGA_TIPS as tip (tip)}<li>{tip}</li>{/each}
  </ul>
</section>
