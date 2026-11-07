<script lang="ts">
  // Recipes, a shelf in More and a shortcut on Me (F61): Cooked (your go-to meals) · Want to try
  // · favourites. Each recipe can send what you need to the shopping list.
  import AddToggle from '../components/AddToggle.svelte'
  import Icon from '../components/Icon.svelte'
  import MoreNav from '../components/MoreNav.svelte'
  import { formatShort, parseDate } from '../lib/dates'
  import type { CookedLog, Recipe } from '../lib/db'
  import { safeLink } from '../lib/links'
  import { live } from '../lib/live.svelte'
  import { addRecipe, deleteRecipe, ingredientLines, listCooked, listRecipes, setCooked, updateRecipe } from '../lib/recipes'
  import { addToShopping } from '../lib/staples'

  let { today, view = 'log' }: { today: string; view?: 'log' | 'want' | 'favorites' } = $props()

  const recipes = live(() => listRecipes, [] as Recipe[])
  const cooked = live(() => listCooked, [] as CookedLog[])

  let filter = $state('All')
  let adding = $state(false)
  let newName = $state('')
  let newMeal = $state('Main')

  const cookedOf = (id: string) => cooked.current.filter((log) => log.recipeId === id)
  const cookedToday = (id: string) => cookedOf(id).some((log) => log.date === today)
  const lastCooked = (id: string) => cookedOf(id)[0]?.date ?? ''

  /** The tab's recipes: Cooked has the most recently cooked first. */
  const inView = $derived.by(() => {
    if (view === 'want') return recipes.current.filter((recipe) => recipe.wantToTry)
    if (view === 'favorites') return recipes.current.filter((recipe) => recipe.favorite)
    return recipes.current.filter((recipe) => !recipe.wantToTry).sort((a, b) => lastCooked(b.id).localeCompare(lastCooked(a.id)))
  })
  const meals = $derived(['All', ...new Set(recipes.current.map((recipe) => recipe.meal))])
  const shown = $derived(filter === 'All' ? inView : inView.filter((recipe) => recipe.meal === filter))

  function tags(recipe: Recipe): string {
    return [recipe.meal, recipe.batch && 'batch-friendly', recipe.freezes && 'freezes well', recipe.prepMinutes && `${recipe.prepMinutes} min`]
      .filter(Boolean)
      .join(' · ')
  }

  function history(recipe: Recipe): string {
    const logs = cookedOf(recipe.id)
    if (!logs.length) return recipe.wantToTry ? 'Not tried yet' : 'Not logged yet'
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
    await addRecipe(name, newMeal.trim() || 'Main', view === 'want')
    newName = ''
    adding = false
  }

  // ── Ingredients to the shopping list (F61) ──
  let shoppingFor = $state<string | null>(null)
  let chosen = $state<Record<string, boolean>>({})
  let shoppingNote = $state<{ id: string; text: string } | null>(null)

  function openShopping(recipe: Recipe) {
    shoppingFor = shoppingFor === recipe.id ? null : recipe.id
    chosen = {}
  }

  async function sendToShopping(recipe: Recipe) {
    const names = ingredientLines(recipe.ingredients).filter((line) => chosen[line])
    const count = await addToShopping(names)
    shoppingFor = null
    chosen = {}
    shoppingNote = { id: recipe.id, text: `${count} ${count === 1 ? 'thing' : 'things'} on your shopping list.` }
  }
</script>

<header class="with-add">
  <div>
    <h1>Recipes</h1>
    <p class="date">
      {view === 'want' ? "Ones you'd like to try. Cooking one moves it to Cooked." : view === 'favorites' ? 'The ones you gave a heart.' : 'Your go-to meals, for the days you need to cook.'}
    </p>
  </div>
  {#if view !== 'favorites'}
    <AddToggle bind:open={adding} label={view === 'want' ? 'Add a recipe to try' : 'Add a recipe'} />
  {/if}
</header>

<MoreNav current="recipes" view={view === 'log' ? 'log' : view} />

<nav class="subtabs media-subtabs" aria-label="Cooked, want to try and favourites">
  <a href="#/recipes" aria-current={view === 'log' ? 'page' : undefined}>Cooked</a>
  <a href="#/recipes/want" aria-current={view === 'want' ? 'page' : undefined}>Want to try</a>
  <a href="#/recipes/favorites" class="fav-tab" aria-current={view === 'favorites' ? 'page' : undefined} aria-label="Favourites" title="Favourites"
    ><Icon name={view === 'favorites' ? 'heart-fill' : 'heart'} /></a
  >
</nav>

{#if adding}
  <section>
    <h2>{view === 'want' ? 'A recipe to try' : 'New recipe'}</h2>
    <form class="add-row" onsubmit={submit}>
      <input class="grow" type="text" bind:value={newName} placeholder="Name" aria-label="New recipe" />
      <input type="text" list="recipe-meals" bind:value={newMeal} placeholder="Meal" aria-label="Meal" />
      <button type="submit" class="button">Add</button>
    </form>
  </section>
{/if}

{#if meals.length > 2}
  <div class="chips list-tabs meal-filter" role="group" aria-label="Meals">
    {#each meals as meal (meal)}
      <button type="button" class="chip" aria-pressed={filter === meal} onclick={() => (filter = meal)}>{meal}</button>
    {/each}
  </div>
{/if}

{#if shown.length}
  <ul class="list recipes">
    {#each shown as recipe (recipe.id)}
      {@const lines = ingredientLines(recipe.ingredients)}
      <li class="row">
        <div class="routine-head">
          <span class="text grow">
            <span class="label">{recipe.name}</span>
            <span class="detail">{tags(recipe)}</span>
            <span class="detail">{history(recipe)}</span>
          </span>
          <button
            type="button"
            class="heart"
            aria-label={recipe.favorite ? `Remove "${recipe.name}" from favourites` : `Add "${recipe.name}" to favourites`}
            aria-pressed={!!recipe.favorite}
            onclick={() => updateRecipe(recipe.id, { favorite: !recipe.favorite })}><Icon name={recipe.favorite ? 'heart-fill' : 'heart'} /></button
          >
          <button
            type="button"
            class="button small"
            class:secondary={cookedToday(recipe.id)}
            onclick={() => setCooked(recipe.id, today, !cookedToday(recipe.id))}
          >
            {cookedToday(recipe.id) ? 'Undo' : 'Cooked today'}
          </button>
        </div>
        {#if shoppingNote?.id === recipe.id}
          <p class="small recipe-note">{shoppingNote.text} <a href="#/shopping">Open it</a></p>
        {/if}
        <details class="steps">
          <summary>Recipe</summary>
          <div class="edit-panel">
            <button type="button" class="link recipe-shop" aria-expanded={shoppingFor === recipe.id} onclick={() => openShopping(recipe)}>Add ingredients to shopping</button>
            {#if shoppingFor === recipe.id}
              <div class="card padded shopping-pick">
                {#if lines.length}
                  <p class="small">Tick what you need. Things you keep at hand are marked low; the rest go on as one-offs.</p>
                  {#each lines as line (line)}
                    <label class="inline-check">
                      <input type="checkbox" checked={!!chosen[line]} onchange={(event) => (chosen = { ...chosen, [line]: event.currentTarget.checked })} />
                      {line}
                    </label>
                  {/each}
                  <button
                    type="button"
                    class="button small"
                    disabled={!lines.some((line) => chosen[line])}
                    onclick={() => sendToShopping(recipe)}>Put {lines.filter((line) => chosen[line]).length || ''} on the shopping list</button
                  >
                {:else}
                  <p class="small muted">No ingredients yet. Add them below, one per line.</p>
                {/if}
              </div>
            {/if}
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
              Ingredients, one per line
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
            <label class="inline-check">
              <input type="checkbox" checked={!!recipe.wantToTry} onchange={(event) => updateRecipe(recipe.id, { wantToTry: event.currentTarget.checked })} />
              On Want to try
            </label>
            <button type="button" class="link danger" onclick={() => window.confirm(`Delete "${recipe.name}"?`) && deleteRecipe(recipe.id)}>Delete recipe</button>
          </div>
        </details>
      </li>
    {/each}
  </ul>
{:else}
  <p class="muted small area-list">
    {view === 'want' ? 'Nothing to try yet. Tap + to add one.' : view === 'favorites' ? 'No favourites yet. Tap the heart on a recipe.' : 'No recipes here yet.'}
  </p>
{/if}

<datalist id="recipe-meals">
  {#each meals.slice(1) as meal (meal)}<option value={meal}></option>{/each}
</datalist>

<p class="muted small">"Cooked today" also ticks Cooked for the day.</p>
