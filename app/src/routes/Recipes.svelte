<script lang="ts">
  import { formatShort, parseDate } from '../lib/dates'
  import type { CookedLog, Recipe } from '../lib/db'
  import { safeLink } from '../lib/links'
  import { live } from '../lib/live.svelte'
  import { addRecipe, deleteRecipe, listCooked, listRecipes, setCooked, updateRecipe } from '../lib/recipes'

  let { today }: { today: string } = $props()

  const recipes = live(() => listRecipes, [] as Recipe[])
  const cooked = live(() => listCooked, [] as CookedLog[])

  let filter = $state('All')
  let newName = $state('')
  let newMeal = $state('Main')

  const meals = $derived(['All', ...new Set(recipes.current.map((recipe) => recipe.meal))])
  const shown = $derived(filter === 'All' ? recipes.current : recipes.current.filter((recipe) => recipe.meal === filter))

  const cookedOf = (id: string) => cooked.current.filter((log) => log.recipeId === id)
  const cookedToday = (id: string) => cookedOf(id).some((log) => log.date === today)

  function tags(recipe: Recipe): string {
    return [recipe.meal, recipe.batch && 'batch-friendly', recipe.freezes && 'freezes well', recipe.prepMinutes && `${recipe.prepMinutes} min`]
      .filter(Boolean)
      .join(' · ')
  }

  function history(recipe: Recipe): string {
    const logs = cookedOf(recipe.id)
    if (!logs.length) return 'Not cooked yet'
    return `Cooked ${logs.length} ${logs.length === 1 ? 'time' : 'times'}, last ${formatShort(parseDate(logs[0].date))}`
  }

  function number(text: string, min: number, max: number): number | null {
    if (!text.trim()) return null
    const value = Math.round(Number(text))
    return Number.isFinite(value) && value >= min && value <= max ? value : null
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    await addRecipe(name, newMeal.trim() || 'Main')
    newName = ''
  }
</script>

<header>
  <h1>Recipes</h1>
  <p class="date">Your go-to meals, for the days you need to cook.</p>
</header>

<div class="chips list-tabs">
  {#each meals as meal (meal)}
    <button type="button" class="chip" aria-pressed={filter === meal} onclick={() => (filter = meal)}>{meal}</button>
  {/each}
</div>

<ul class="list recipes">
  {#each shown as recipe (recipe.id)}
    <li class="row">
      <div class="routine-head">
        <span class="text grow">
          <span class="label">{recipe.name}</span>
          <span class="detail">{tags(recipe)}</span>
          <span class="detail">{history(recipe)}</span>
        </span>
        <button
          type="button"
          class="button small"
          class:secondary={cookedToday(recipe.id)}
          onclick={() => setCooked(recipe.id, today, !cookedToday(recipe.id))}
        >
          {cookedToday(recipe.id) ? 'Undo' : 'Cooked today'}
        </button>
      </div>
      <details class="steps">
        <summary>Recipe</summary>
        <div class="edit-panel">
          <label>
            Name
            <input
              type="text"
              value={recipe.name}
              onchange={(event) => {
                const name = event.currentTarget.value.trim()
                if (name) void updateRecipe(recipe.id, { name })
              }}
            />
          </label>
          <label>
            Meal
            <input type="text" list="recipe-meals" value={recipe.meal} onchange={(event) => updateRecipe(recipe.id, { meal: event.currentTarget.value.trim() || 'Main' })} />
          </label>
          <label class="inline-check">
            <input type="checkbox" checked={recipe.batch} onchange={(event) => updateRecipe(recipe.id, { batch: event.currentTarget.checked })} />
            Good for batch cooking
          </label>
          <label class="inline-check">
            <input type="checkbox" checked={recipe.freezes} onchange={(event) => updateRecipe(recipe.id, { freezes: event.currentTarget.checked })} />
            Freezes well
          </label>
          <label>
            Prep time, minutes
            <input type="number" min="0" value={recipe.prepMinutes ?? ''} onchange={(event) => updateRecipe(recipe.id, { prepMinutes: number(event.currentTarget.value, 0, 1000) })} />
          </label>
          <label>
            How much you like it, 1–5
            <input type="number" min="1" max="5" value={recipe.enjoyment ?? ''} onchange={(event) => updateRecipe(recipe.id, { enjoyment: number(event.currentTarget.value, 1, 5) })} />
          </label>
          <label>
            Ingredients
            <textarea rows="4" value={recipe.ingredients} onchange={(event) => updateRecipe(recipe.id, { ingredients: event.currentTarget.value })}></textarea>
          </label>
          <label>
            Directions
            <textarea rows="5" value={recipe.directions} onchange={(event) => updateRecipe(recipe.id, { directions: event.currentTarget.value })}></textarea>
          </label>
          <label>
            Link
            <input type="url" value={recipe.link} onchange={(event) => updateRecipe(recipe.id, { link: event.currentTarget.value.trim() })} />
          </label>
          {#if safeLink(recipe.link)}
            <a href={safeLink(recipe.link)} target="_blank" rel="noopener noreferrer">Open the link</a>
          {/if}
          <button type="button" class="link danger" onclick={() => window.confirm(`Delete "${recipe.name}"?`) && deleteRecipe(recipe.id)}>Delete recipe</button>
        </div>
      </details>
    </li>
  {/each}
</ul>

<datalist id="recipe-meals">
  {#each meals.slice(1) as meal (meal)}<option value={meal}></option>{/each}
</datalist>

<section>
  <h2>New recipe</h2>
  <form class="add-row" onsubmit={submit}>
    <input class="grow" type="text" bind:value={newName} placeholder="Name" aria-label="New recipe" />
    <input type="text" list="recipe-meals" bind:value={newMeal} placeholder="Meal" aria-label="Meal" />
    <button type="submit" class="button">Add</button>
  </form>
  <p class="muted small">"Cooked today" also ticks Cooked for the day.</p>
</section>
