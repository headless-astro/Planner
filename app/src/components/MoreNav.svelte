<script lang="ts">
  // The chips at the top of More: Books, Games, Movies, Shows and Recipes (F61). Switching keeps
  // the kind of sub-tab you're on: what you're on now, want to, finished, or favourites.
  import { ALL_FEATURES } from '../lib/features'
  import { live } from '../lib/live.svelte'
  import { SHELVES, type Shelf } from '../lib/media'
  import { getFeatures } from '../lib/repo'

  type View = 'log' | 'want' | 'done' | 'favorites'
  let { current, view }: { current: Shelf | 'recipes'; view: View } = $props()

  const SHELF_PATH: Record<View, string> = { log: '', want: '/want', done: '/done', favorites: '/favorites' }
  // On Recipes, Cooked is the first tab and stands in for both "now" and "finished".
  const RECIPE_PATH: Record<View, string> = { log: '', want: '/want', done: '', favorites: '/favorites' }
  const fromRecipes: Record<View, View> = { log: 'done', want: 'want', done: 'done', favorites: 'favorites' }

  const shelfView = $derived(current === 'recipes' ? fromRecipes[view] : view)
  // Shelves that are turned off aren't shown (F63); the one you're on always is.
  const features = live(() => getFeatures, ALL_FEATURES)
  const shelves = $derived((Object.entries(SHELVES) as [Shelf, (typeof SHELVES)[Shelf]][]).filter(([key]) => features.current[key] || key === current))
</script>

<nav class="chips list-tabs" aria-label="Books, games, movies, shows and recipes">
  {#each shelves as [key, value] (key)}
    <a class="chip" href="#/{key}{SHELF_PATH[shelfView]}" aria-current={key === current ? 'page' : undefined}>{value.title}</a>
  {/each}
  {#if features.current.recipes || current === 'recipes'}
    <a class="chip" href="#/recipes{RECIPE_PATH[view]}" aria-current={current === 'recipes' ? 'page' : undefined}>Recipes</a>
  {/if}
</nav>
