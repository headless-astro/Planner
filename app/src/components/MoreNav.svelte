<script lang="ts">
  // The chips at the top of More: Books, Games, Movies, Shows, your own sections (F77) and
  // Recipes (F61). Switching keeps the kind of sub-tab you're on: what you're on now, want to,
  // finished, or favourites.
  import { ALL_FEATURES } from '../lib/features'
  import { live } from '../lib/live.svelte'
  import { BUILT_IN_SHELVES, getShelves, listSections, visibleShelves, type CustomSection, type Shelf } from '../lib/media'
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
  const all = live(() => getShelves, BUILT_IN_SHELVES)
  const sections = live(() => listSections, [] as CustomSection[])
  const shown = $derived(new Set(visibleShelves(all.current, sections.current, features.current).map((info) => info.key)))
  const shelves = $derived(all.current.filter((info) => shown.has(info.key) || info.key === current))
</script>

<nav class="chips list-tabs" aria-label="Sections in More">
  {#each shelves as info (info.key)}
    <a class="chip" href="{info.href}{SHELF_PATH[shelfView]}" aria-current={info.key === current ? 'page' : undefined}>{info.title}</a>
  {/each}
  {#if features.current.recipes || current === 'recipes'}
    <a class="chip" href="#/recipes{RECIPE_PATH[view]}" aria-current={current === 'recipes' ? 'page' : undefined}>Recipes</a>
  {/if}
</nav>
