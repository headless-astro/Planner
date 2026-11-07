<script lang="ts">
  // The exercise plan (F35, F59): three blocks, Primer, Easy and Intermediate, 4 weeks each and
  // all editable. One is active; Today's workout follows it. The workout days come from your
  // week, so they follow changes made on the Week screen.
  import { WEEKDAYS, formatShort, parseDate } from '../lib/dates'
  import { BLOCK_IDS, BLOCK_WEEKS, DEFAULT_EXERCISE, blockNow, blockText, type BlockId, type ExerciseBlock, type Move } from '../lib/exercise'
  import { live } from '../lib/live.svelte'
  import { getExercise, getWeek, resetBlock, startBlock, updateBlock } from '../lib/repo'
  import { WORKOUTS, type DayTemplate } from '../lib/setup'

  let { today }: { today: string } = $props()

  const week = live<DayTemplate[] | null>(() => getWeek, null)
  const plan = live(() => getExercise, DEFAULT_EXERCISE)

  // The block you're looking at; the active one to start with.
  let picked = $state<BlockId | null>(null)
  const viewing = $derived<BlockId>(picked ?? plan.current.active)
  const block = $derived(plan.current.blocks[viewing])
  const isActive = $derived(viewing === plan.current.active)
  const now = $derived(blockNow(plan.current, parseDate(today)))
  /** The week to highlight: this week, on the active block. */
  const current = $derived(isActive ? now.week : null)
  const weekNumbers = Array.from({ length: BLOCK_WEEKS }, (_, i) => i + 1)

  let editing = $state(false)

  function makeActive() {
    if (window.confirm(`Start ${block.name} at week 1 today? Today's workout will follow it.`)) void startBlock(viewing, today)
  }

  function reset() {
    if (window.confirm(`Put ${block.name} back to the suggested exercises? Your changes to it are lost.`)) void resetBlock(viewing)
  }

  const save = (changes: Partial<ExerciseBlock>) => updateBlock(viewing, changes)
  /** Four values, one per week, with one changed. */
  const withWeek = <T,>(values: readonly T[], index: number, value: T) => Array.from({ length: BLOCK_WEEKS }, (_, i) => (i === index ? value : values[i]))

  function saveMove(index: number, move: Move | null) {
    const moves = [...block.moves]
    if (move) moves[index] = move
    else moves.splice(index, 1)
    void save({ moves })
  }

  const lines = (text: string) =>
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
</script>

<header class="with-add">
  <div>
    <h1>Exercise plan</h1>
    <p class="date">{blockText(plan.current, today)}</p>
  </div>
</header>

<div class="chips list-tabs" role="group" aria-label="Blocks">
  {#each BLOCK_IDS as id (id)}
    <button type="button" class="chip" aria-pressed={viewing === id} onclick={() => ((picked = id), (editing = false))}>
      {plan.current.blocks[id].name}{id === plan.current.active ? ' ✓' : ''}
    </button>
  {/each}
</div>

<div class="block-bar">
  {#if isActive}
    <p class="small">
      Active since {formatShort(parseDate(plan.current.start))}. Each block is 4 weeks, then starts over at week 1.
    </p>
  {:else}
    <button type="button" class="button" onclick={makeActive}>Make {block.name} active</button>
    <p class="muted small">It starts at week 1 today, and Today's workout follows it.</p>
  {/if}
  <button type="button" class="button secondary small" aria-pressed={editing} onclick={() => (editing = !editing)}>{editing ? 'Done editing' : 'Edit'}</button>
</div>

{#if isActive}
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
{/if}

{#if editing}
  <section class="block-edit">
    <h2>Edit {block.name}</h2>
    <label class="field">
      <span class="field-label">Name</span>
      <input type="text" value={block.name} onchange={(event) => event.currentTarget.value.trim() && save({ name: event.currentTarget.value.trim() })} />
    </label>
    <label class="field">
      <span class="field-label">Warm-up</span>
      <textarea rows="2" value={block.warmUp} onchange={(event) => save({ warmUp: event.currentTarget.value.trim() })}></textarea>
    </label>

    <h3>Strength moves</h3>
    {#each block.moves as move, index (index)}
      <div class="card padded move-edit">
        <input
          type="text"
          value={move.name}
          aria-label="Move {index + 1}"
          onchange={(event) => event.currentTarget.value.trim() && saveMove(index, { ...move, name: event.currentTarget.value.trim() })}
        />
        <div class="week-inputs">
          {#each weekNumbers as number, i (number)}
            <label>
              Wk {number}
              <input
                type="text"
                value={move.reps[i] ?? ''}
                aria-label="{move.name}, week {number}"
                onchange={(event) => saveMove(index, { ...move, reps: withWeek(move.reps, i, event.currentTarget.value.trim()) })}
              />
            </label>
          {/each}
        </div>
        <button type="button" class="link danger" onclick={() => window.confirm(`Remove ${move.name}?`) && saveMove(index, null)}>Remove</button>
      </div>
    {/each}
    <button type="button" class="button secondary small" onclick={() => save({ moves: [...block.moves, { name: 'New move', reps: ['', '', '', ''] }] })}>Add a move</button>

    <h3>Rounds, cardio and longer cardio</h3>
    <div class="card padded">
      {#each [{ key: 'rounds', label: 'Rounds' }, { key: 'cardio', label: 'Cardio' }, { key: 'longCardio', label: 'Longer cardio' }] as row (row.key)}
        <span class="field-label">{row.label}</span>
        <div class="week-inputs">
          {#each weekNumbers as number, i (number)}
            <label>
              Wk {number}
              {#if row.key === 'rounds'}
                <input
                  type="number"
                  min="1"
                  value={block.rounds[i] ?? ''}
                  aria-label="Rounds, week {number}"
                  onchange={(event) => {
                    const rounds = Math.round(Number(event.currentTarget.value))
                    if (rounds >= 1) void save({ rounds: withWeek(block.rounds, i, rounds) })
                  }}
                />
              {:else}
                {@const key = row.key as 'cardio' | 'longCardio'}
                <input
                  type="text"
                  value={block[key][i] ?? ''}
                  aria-label="{row.label}, week {number}"
                  onchange={(event) => save({ [key]: withWeek(block[key], i, event.currentTarget.value.trim()) })}
                />
              {/if}
            </label>
          {/each}
        </div>
      {/each}
    </div>

    <h3>Yoga or pilates</h3>
    <label class="field">
      <span class="small">One tip per line.</span>
      <textarea rows="4" value={block.yoga.join('\n')} aria-label="Yoga or pilates tips" onchange={(event) => save({ yoga: lines(event.currentTarget.value) })}></textarea>
    </label>

    <p><button type="button" class="link danger" onclick={reset}>Put {block.name} back to the suggestion</button></p>
  </section>
{/if}

<section>
  <h2>How it works</h2>
  <ul class="card padded-list small">
    <li>Mornings are best. {block.warmUp}.</li>
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
        {#each block.moves as move, index (index)}
          <tr>
            <th scope="row">{move.name}</th>
            {#each weekNumbers as number, i (number)}<td class:is-now={number === current}>{move.reps[i] ?? ''}</td>{/each}
          </tr>
        {/each}
        <tr>
          <th scope="row">Rounds</th>
          {#each weekNumbers as number, i (number)}<td class:is-now={number === current}>{block.rounds[i] ?? ''}</td>{/each}
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
          {#each weekNumbers as number, i (number)}<td class:is-now={number === current}>{block.cardio[i] ?? ''}</td>{/each}
        </tr>
        <tr>
          <th scope="row">Longer cardio</th>
          {#each weekNumbers as number, i (number)}<td class:is-now={number === current}>{block.longCardio[i] ?? ''}</td>{/each}
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
    {#each block.yoga as tip (tip)}<li>{tip}</li>{/each}
  </ul>
</section>
