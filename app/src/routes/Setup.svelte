<script lang="ts">
  import { downloadBackup, exportBackup, importBackup } from '../lib/backup'
  import { formatDate } from '../lib/dates'
  import type { Dose, Habit, SnackDef } from '../lib/db'
  import { live } from '../lib/live.svelte'
  import {
    addDose,
    addHabit,
    addSnackDef,
    deleteDose,
    deleteHabit,
    deleteSnackDef,
    getAppearance,
    getFoodRules,
    getMeta,
    getReminders,
    getTargets,
    listDoses,
    listHabits,
    listSnackDefs,
    moveDose,
    moveHabit,
    moveSnackDef,
    setMeta,
    updateAppearance,
    updateDose,
    updateFoodRules,
    updateHabit,
    updateReminders,
    updateSnackDef,
    updateTargets,
  } from '../lib/repo'
  import {
    DEFAULT_APPEARANCE,
    DEFAULT_FOOD_RULES,
    DEFAULT_REMINDERS,
    DEFAULT_TARGETS,
    PALETTES,
    type Targets,
    type TimeOfDay,
  } from '../lib/setup'
  import { textLines } from '../lib/text'

  const doses = live(() => listDoses, [] as Dose[])
  const habits = live(() => listHabits, [] as Habit[])
  const snackDefs = live(() => listSnackDefs, [] as SnackDef[])
  const targets = live(() => getTargets, DEFAULT_TARGETS)
  const reminders = live(() => getReminders, DEFAULT_REMINDERS)
  const lastExport = live(() => () => getMeta<number>('lastExport'), undefined as number | undefined)
  const appearance = live(() => getAppearance, DEFAULT_APPEARANCE)
  const foodRules = live(() => getFoodRules, DEFAULT_FOOD_RULES)

  const TIMES: { value: TimeOfDay; label: string }[] = [
    { value: 'morning', label: 'Morning' },
    { value: 'anytime', label: 'Any time' },
    { value: 'evening', label: 'Evening' },
  ]

  const TARGET_FIELDS: { key: keyof Targets; label: string; unit: string }[] = [
    { key: 'rules', label: 'Food rules kept', unit: 'days a week' },
    { key: 'fitness', label: 'Workouts', unit: 'a week' },
    { key: 'spanish', label: 'Spanish', unit: 'days a week' },
    { key: 'study', label: 'Tech study', unit: 'sessions a week' },
    { key: 'skin', label: 'Skin routine', unit: 'days a week' },
    { key: 'snackBudget', label: 'Snack budget', unit: 'kcal a day' },
  ]

  let newDose = $state('')
  let newDoseTime = $state<TimeOfDay>('anytime')
  let newHabit = $state('')
  // Number boxes bound with bind:value hold numbers (or null when empty), not text.
  let newHabitTarget = $state<number | null>(null)
  let newSnack = $state('')
  let newSnackKcal = $state<number | null>(null)
  let importMessage = $state<string | null>(null)
  let persisted = $state<boolean | null>(null)

  /** A whole number of 0 or more, or null if it's empty or not a number. */
  function wholeNumber(value: string | number | null | undefined): number | null {
    const text = value === null || value === undefined ? '' : String(value).trim()
    if (!text) return null
    const number = Math.round(Number(text.replace(',', '.')))
    return Number.isFinite(number) && number >= 0 ? number : null
  }

  const confirmDelete = (name: string) => window.confirm(`Delete "${name}"?`)

  async function submitDose(event: SubmitEvent) {
    event.preventDefault()
    const label = newDose.trim()
    if (!label) return
    await addDose(label, newDoseTime)
    newDose = ''
  }

  async function submitHabit(event: SubmitEvent) {
    event.preventDefault()
    const label = newHabit.trim()
    if (!label) return
    await addHabit(label, wholeNumber(newHabitTarget))
    newHabit = ''
    newHabitTarget = null
  }

  async function submitSnack(event: SubmitEvent) {
    event.preventDefault()
    const name = newSnack.trim()
    const kcal = wholeNumber(newSnackKcal)
    if (!name || kcal === null) return
    await addSnackDef(name, kcal)
    newSnack = ''
    newSnackKcal = null
  }

  function rename(text: string, save: (name: string) => Promise<void>) {
    const name = text.trim()
    if (name) void save(name)
  }

  async function exportNow() {
    downloadBackup(await exportBackup())
    await setMeta('lastExport', Date.now())
  }

  async function importFile(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const result = await importBackup(JSON.parse(await file.text()))
      importMessage = `Imported: ${result.added} new, ${result.updated} updated, ${result.skipped} already up to date.`
    } catch (error) {
      importMessage = error instanceof SyntaxError || !(error instanceof Error) ? "That file couldn't be read as a backup." : error.message
    } finally {
      input.value = ''
    }
  }

  $effect(() => {
    navigator.storage?.persisted?.().then(
      (value) => (persisted = value),
      () => (persisted = null),
    )
  })

  async function protect() {
    persisted = (await navigator.storage?.persist?.()) ?? false
  }
</script>

{#snippet rowActions(name: string, index: number, count: number, move: (step: -1 | 1) => Promise<void>, remove: () => Promise<void>)}
  <span class="row-actions">
    <button type="button" class="icon-button" aria-label="Move {name} up" disabled={index === 0} onclick={() => move(-1)}>↑</button>
    <button type="button" class="icon-button" aria-label="Move {name} down" disabled={index === count - 1} onclick={() => move(1)}>↓</button>
    <button type="button" class="link danger" onclick={() => confirmDelete(name) && remove()}>Delete</button>
  </span>
{/snippet}

<header>
  <h1>Setup</h1>
  <p class="date">Changes save as you go.</p>
</header>

<section>
  <h2>Colours</h2>
  <div class="swatches" role="group" aria-label="Colours">
    {#each PALETTES as palette (palette.id)}
      <button
        type="button"
        class="swatch"
        style:--swatch={palette.swatch}
        aria-pressed={appearance.current.palette === palette.id}
        onclick={() => updateAppearance({ palette: palette.id })}
      >
        <span class="swatch-dot" aria-hidden="true"></span>
        {palette.name}
      </button>
    {/each}
  </div>
</section>

<section>
  <h2>Meds</h2>
  <ul class="card edit-list">
    {#each doses.current as dose, index (dose.id)}
      <li>
        <input
          class="grow"
          type="text"
          value={dose.label}
          aria-label="Dose name"
          onchange={(event) => rename(event.currentTarget.value, (label) => updateDose(dose.id, { label }))}
        />
        <select
          value={dose.time}
          aria-label="When to take {dose.label}"
          onchange={(event) => updateDose(dose.id, { time: event.currentTarget.value as TimeOfDay })}
        >
          {#each TIMES as time (time.value)}<option value={time.value}>{time.label}</option>{/each}
        </select>
        {@render rowActions(dose.label, index, doses.current.length, (step) => moveDose(dose.id, step), () => deleteDose(dose.id))}
      </li>
    {/each}
  </ul>
  <form class="add-row" onsubmit={submitDose}>
    <input class="grow" type="text" bind:value={newDose} placeholder="e.g. Meds · with lunch" aria-label="New dose" />
    <select bind:value={newDoseTime} aria-label="When to take the new dose">
      {#each TIMES as time (time.value)}<option value={time.value}>{time.label}</option>{/each}
    </select>
    <button type="submit" class="button">Add</button>
  </form>
</section>

<section>
  <h2>Also today</h2>
  <p class="muted small">Quick daily ticks. The number is how many days a week you're aiming for; leave it empty for none.</p>
  <ul class="card edit-list">
    {#each habits.current as habit, index (habit.id)}
      <li>
        <input
          class="grow"
          type="text"
          value={habit.label}
          aria-label="Habit name"
          onchange={(event) => rename(event.currentTarget.value, (label) => updateHabit(habit.id, { label }))}
        />
        <input
          type="number"
          min="0"
          max="7"
          value={habit.weeklyTarget ?? ''}
          aria-label="{habit.label}: days a week"
          onchange={(event) => updateHabit(habit.id, { weeklyTarget: wholeNumber(event.currentTarget.value) })}
        />
        {@render rowActions(habit.label, index, habits.current.length, (step) => moveHabit(habit.id, step), () => deleteHabit(habit.id))}
      </li>
    {/each}
  </ul>
  <form class="add-row" onsubmit={submitHabit}>
    <input class="grow" type="text" bind:value={newHabit} placeholder="New habit" aria-label="New habit" />
    <input type="number" min="0" max="7" bind:value={newHabitTarget} placeholder="days" aria-label="New habit: days a week" />
    <button type="submit" class="button">Add</button>
  </form>
</section>

<section>
  <h2>Targets</h2>
  <div class="card targets">
    {#each TARGET_FIELDS as field (field.key)}
      <label for="target-{field.key}">{field.label}</label>
      <span class="target-input">
        <input
          id="target-{field.key}"
          type="number"
          min="0"
          value={targets.current[field.key]}
          onchange={(event) => {
            const value = wholeNumber(event.currentTarget.value)
            if (value !== null) void updateTargets({ [field.key]: value })
          }}
        />
        <span class="hint">{field.unit}</span>
      </span>
    {/each}
  </div>
</section>

<section>
  <h2>Food rules</h2>
  <label class="field">
    <span class="small">One rule per line. They show under "See the rules" on Today, on the days the rules are on.</span>
    <textarea
      rows="8"
      value={foodRules.current.join('\n')}
      aria-label="Food rules, one per line"
      onchange={(event) => {
        const rules = textLines(event.currentTarget.value)
        void updateFoodRules(rules.length ? rules : DEFAULT_FOOD_RULES)
      }}
    ></textarea>
  </label>
</section>

<section>
  <h2>Snack list</h2>
  <ul class="card edit-list">
    {#each snackDefs.current as snack, index (snack.id)}
      <li>
        <input
          class="grow"
          type="text"
          value={snack.name}
          aria-label="Snack name"
          onchange={(event) => rename(event.currentTarget.value, (name) => updateSnackDef(snack.id, { name }))}
        />
        <input
          type="number"
          min="0"
          value={snack.kcal}
          aria-label="{snack.name}: kcal"
          onchange={(event) => {
            const kcal = wholeNumber(event.currentTarget.value)
            if (kcal !== null) void updateSnackDef(snack.id, { kcal })
          }}
        />
        <span class="hint">kcal</span>
        {@render rowActions(snack.name, index, snackDefs.current.length, (step) => moveSnackDef(snack.id, step), () => deleteSnackDef(snack.id))}
      </li>
    {/each}
  </ul>
  <form class="add-row" onsubmit={submitSnack}>
    <input class="grow" type="text" bind:value={newSnack} placeholder="New snack" aria-label="New snack" />
    <input type="number" min="0" bind:value={newSnackKcal} placeholder="kcal" aria-label="New snack: kcal" />
    <button type="submit" class="button">Add</button>
  </form>
</section>

<section>
  <h2>Reminders</h2>
  <div class="card targets">
    <label for="reminder-morning">Morning</label>
    <input
      id="reminder-morning"
      type="time"
      value={reminders.current.morning}
      onchange={(event) => {
        if (event.currentTarget.value) void updateReminders({ morning: event.currentTarget.value })
      }}
    />
    <label for="reminder-night">Night</label>
    <input
      id="reminder-night"
      type="time"
      value={reminders.current.night}
      onchange={(event) => {
        if (event.currentTarget.value) void updateReminders({ night: event.currentTarget.value })
      }}
    />
  </div>
  <p class="muted small">Turn them on for each device under <a href="#/sync">Sync and reminders</a>.</p>
</section>

<section>
  <h2>Backup</h2>
  <p class="small">Saves everything to a file. Keep a copy somewhere safe, like Google Drive, about once a month.</p>
  <div class="actions">
    <button type="button" class="button" onclick={exportNow}>Export backup</button>
    <label class="button secondary">
      Import backup
      <input type="file" accept="application/json,.json" class="visually-hidden" onchange={importFile} />
    </label>
  </div>
  <p class="muted small">
    Last export: {lastExport.current ? formatDate(new Date(lastExport.current)) : 'never'}. Importing merges: when something
    changed in both places, the newer change wins.
  </p>
  {#if importMessage}<p class="notice" role="status">{importMessage}</p>{/if}
</section>

<section>
  <h2>Storage</h2>
  {#if persisted === true}
    <p class="small">This device keeps the app's data. It won't clear it on its own.</p>
  {:else if persisted === false}
    <p class="small">The browser may clear the app's data if the device runs low on space. Installing the app usually fixes this.</p>
    <button type="button" class="button secondary" onclick={protect}>Ask to keep the data</button>
  {:else}
    <p class="muted small">Can't check storage protection in this browser.</p>
  {/if}
</section>
