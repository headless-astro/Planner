<script lang="ts">
  import { parseDate, toISODate, todayISO, weekStart } from './lib/dates'
  import { live } from './lib/live.svelte'
  import { refreshReminders } from './lib/push'
  import { ensureSeeded, getAppearance } from './lib/repo'
  import { DEFAULT_APPEARANCE } from './lib/setup'
  import { getSyncConfig, startSync } from './lib/sync'
  import Day from './routes/Day.svelte'
  import Drawing from './routes/Drawing.svelte'
  import Goals from './routes/Goals.svelte'
  import History from './routes/History.svelte'
  import Link from './routes/Link.svelte'
  import Lists from './routes/Lists.svelte'
  import Media from './routes/Media.svelte'
  import More from './routes/More.svelte'
  import Projects from './routes/Projects.svelte'
  import Recipes from './routes/Recipes.svelte'
  import Review from './routes/Review.svelte'
  import Routines from './routes/Routines.svelte'
  import Setup from './routes/Setup.svelte'
  import Shopping from './routes/Shopping.svelte'
  import Spanish from './routes/Spanish.svelte'
  import Stats from './routes/Stats.svelte'
  import Study from './routes/Study.svelte'
  import Sync from './routes/Sync.svelte'
  import Topic from './routes/Topic.svelte'
  import Tracks from './routes/Tracks.svelte'
  import Week from './routes/Week.svelte'

  const SCREENS = [
    'today',
    'lists',
    'routines',
    'history',
    'more',
    'week',
    'shopping',
    'tracks',
    'setup',
    'study',
    'spanish',
    'recipes',
    'review',
    'stats',
    'drawing',
    'books',
    'games',
    'shows',
    'projects',
    'goals',
    'sync',
  ] as const
  type Screen = (typeof SCREENS)[number]
  type Route =
    | { name: Screen }
    | { name: 'day'; date: string }
    | { name: 'topic'; number: number }
    | { name: 'review-week'; monday: string }
    | { name: 'link'; payload: string }

  const tabs: { name: Screen; label: string }[] = [
    { name: 'today', label: 'Today' },
    { name: 'lists', label: 'Lists' },
    { name: 'routines', label: 'Routines' },
    { name: 'history', label: 'History' },
    { name: 'more', label: 'More' },
  ]

  /** Screens reached from "More" keep that tab highlighted. */
  const UNDER_MORE: string[] = [
    'week',
    'shopping',
    'tracks',
    'setup',
    'study',
    'topic',
    'spanish',
    'recipes',
    'review',
    'review-week',
    'stats',
    'drawing',
    'books',
    'games',
    'shows',
    'projects',
    'goals',
    'sync',
    'link',
  ]

  /** The three media screens share one component. */
  const MEDIA_SCREENS = { books: 'book', games: 'game', shows: 'watch' } as const

  const isDate = (value: string | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)

  // Links look like #/today, so GitHub Pages never has to serve anything but index.html.
  function readRoute(): Route {
    const [name, argument] = location.hash.replace(/^#\/?/, '').split('/')
    if (name === 'day' && isDate(argument)) return { name: 'day', date: argument }
    if (name === 'study' && argument && /^\d+$/.test(argument)) return { name: 'topic', number: Number(argument) }
    if (name === 'review' && isDate(argument)) return { name: 'review-week', monday: toISODate(weekStart(parseDate(argument))) }
    if (name === 'link') return { name: 'link', payload: argument ?? '' }
    const screen = SCREENS.find((candidate) => candidate === name)
    return { name: screen ?? 'today' }
  }

  let route = $state<Route>(readRoute())
  let today = $state(todayISO())
  let ready = $state(false)
  let failure = $state<string | null>(null)

  const thisMonday = $derived(toISODate(weekStart(parseDate(today))))
  const activeTab = $derived(route.name === 'day' ? 'history' : UNDER_MORE.includes(route.name) ? 'more' : route.name)

  // Colours (F28). The palette is also kept on the device, so index.html can apply it before
  // the data loads, and the browser's bar takes the page colour.
  const appearance = live(() => getAppearance, DEFAULT_APPEARANCE)

  function applyPalette(palette: string) {
    document.documentElement.dataset.palette = palette
    try {
      localStorage.setItem('palette', palette)
    } catch {
      // Private windows can refuse storage; the colours still apply.
    }
    const color = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
  }

  $effect(() => applyPalette(appearance.current.palette))

  $effect(() => {
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onChange = () => applyPalette(document.documentElement.dataset.palette ?? DEFAULT_APPEARANCE.palette)
    dark?.addEventListener?.('change', onChange)
    return () => dark?.removeEventListener?.('change', onChange)
  })

  ensureSeeded()
    .then(() => {
      ready = true
      // Ask the browser to keep the data even when the device runs low on space.
      void navigator.storage?.persist?.()
      // Sync with the server, if this device is connected (M2).
      startSync()
      void getSyncConfig().then(refreshReminders, () => undefined)
    })
    .catch((error: unknown) => {
      failure = error instanceof Error ? error.message : String(error)
    })

  $effect(() => {
    const onHashChange = () => {
      route = readRoute()
      window.scrollTo?.(0, 0)
    }
    // The day turns over at 06:00: re-check when the app comes back into view, and every minute.
    const refreshDay = () => (today = todayISO())
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshDay()
    }
    window.addEventListener('hashchange', onHashChange)
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(refreshDay, 60_000)
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  })
</script>

<main class="page">
  {#if failure}
    <p class="notice">The app couldn't open its storage on this device: {failure}</p>
  {:else if !ready}
    <p class="muted">Loading…</p>
  {:else if route.name === 'day'}
    {#key route.date}
      <Day date={route.date} isToday={route.date === today} />
    {/key}
  {:else if route.name === 'topic'}
    {#key route.number}
      <Topic number={route.number} {today} />
    {/key}
  {:else if route.name === 'review' || route.name === 'review-week'}
    {@const monday = route.name === 'review-week' ? route.monday : thisMonday}
    {#key monday}
      <Review {monday} {today} />
    {/key}
  {:else if route.name === 'lists'}
    <Lists {today} />
  {:else if route.name === 'routines'}
    <Routines {today} />
  {:else if route.name === 'history'}
    <History {today} />
  {:else if route.name === 'more'}
    <More />
  {:else if route.name === 'week'}
    <Week {today} />
  {:else if route.name === 'shopping'}
    <Shopping />
  {:else if route.name === 'tracks'}
    <Tracks {today} />
  {:else if route.name === 'setup'}
    <Setup />
  {:else if route.name === 'study'}
    <Study {today} />
  {:else if route.name === 'spanish'}
    <Spanish {today} />
  {:else if route.name === 'recipes'}
    <Recipes {today} />
  {:else if route.name === 'stats'}
    <Stats {today} />
  {:else if route.name === 'drawing'}
    <Drawing {today} />
  {:else if route.name === 'books' || route.name === 'games' || route.name === 'shows'}
    {@const kind = MEDIA_SCREENS[route.name]}
    {#key kind}
      <Media {kind} {today} />
    {/key}
  {:else if route.name === 'projects'}
    <Projects {today} />
  {:else if route.name === 'goals'}
    <Goals {today} />
  {:else if route.name === 'sync'}
    <Sync />
  {:else if route.name === 'link'}
    <Link payload={route.payload} />
  {:else}
    {#key today}
      <Day date={today} isToday />
    {/key}
  {/if}
</main>

<nav class="tabs" aria-label="Screens">
  {#each tabs as tab (tab.name)}
    <a href="#/{tab.name}" aria-current={activeTab === tab.name ? 'page' : undefined}>{tab.label}</a>
  {/each}
</nav>
