<script lang="ts">
  import { parseDate, toISODate, todayISO, weekStart } from './lib/dates'
  import { live } from './lib/live.svelte'
  import { refreshReminders } from './lib/push'
  import { ALL_FEATURES } from './lib/features'
  import { getAppearance, getFeatures } from './lib/repo'
  import { DRAWING_TRACK, SPANISH_TRACK, TECH_TRACK } from './lib/activities'
  import { prepareDevice } from './lib/start'
  import { DEFAULT_APPEARANCE } from './lib/setup'
  import { getSyncConfig, onSynced, startSync } from './lib/sync'
  import { scheduleAnalysis } from './lib/ai'
  import Icon, { type IconName } from './components/Icon.svelte'
  import Day from './routes/Day.svelte'
  import Exercise from './routes/Exercise.svelte'
  import Goals from './routes/Goals.svelte'
  import Insights from './routes/Insights.svelte'
  import Join from './routes/Join.svelte'
  import Link from './routes/Link.svelte'
  import Welcome from './routes/Welcome.svelte'
  import Lists from './routes/Lists.svelte'
  import Me from './routes/Me.svelte'
  import Media, { type MediaView } from './routes/Media.svelte'
  import type { Shelf } from './lib/media'
  import Plans from './routes/Plans.svelte'
  import Recipes from './routes/Recipes.svelte'
  import Review from './routes/Review.svelte'
  import Routines from './routes/Routines.svelte'
  import Settings from './routes/Settings.svelte'
  import Setup from './routes/Setup.svelte'
  import Shopping from './routes/Shopping.svelte'
  import Step from './routes/Step.svelte'
  import Sync from './routes/Sync.svelte'
  import Ai from './routes/Ai.svelte'
  import Track from './routes/Track.svelte'
  import Tracks from './routes/Tracks.svelte'
  import Upcoming from './routes/Upcoming.svelte'
  import Week from './routes/Week.svelte'

  const SCREENS = [
    'today',
    'plans',
    'lists',
    'upcoming',
    'routines',
    'insights',
    'me',
    'settings',
    'week',
    'shopping',
    'tracks',
    'setup',
    'recipes',
    'review',
    'books',
    'games',
    'movies',
    'shows',
    'exercise',
    'goals',
    'sync',
    'ai',
  ] as const
  type Screen = (typeof SCREENS)[number]
  type Route =
    | { name: Screen; view?: MediaView; adding?: boolean }
    | { name: 'day'; date: string }
    | { name: 'track'; id: string }
    | { name: 'step'; id: string; number?: number }
    | { name: 'review-week'; monday: string }
    | { name: 'link'; payload: string }
    | { name: 'join'; payload: string }

  type Tab = 'today' | 'plans' | 'routines' | 'insights' | 'more' | 'me' | 'settings'

  // Seven icon tabs with small labels (F32).
  const tabs: { name: Tab; label: string; icon: IconName; href?: string }[] = [
    { name: 'today', label: 'Today', icon: 'calendar-heart' },
    { name: 'plans', label: 'Plans', icon: 'list-checks' },
    { name: 'routines', label: 'Routines', icon: 'clock-countdown' },
    { name: 'insights', label: 'Insights', icon: 'chart-line-up' },
    // More opens on Books, which links to Games, Movies and Shows.
    { name: 'more', label: 'More', icon: 'plus-circle', href: '#/books' },
    { name: 'me', label: 'Me', icon: 'user' },
    { name: 'settings', label: 'Settings', icon: 'gear' },
  ]

  /** Which tab stays highlighted on the screens inside it. */
  const TAB_OF: Partial<Record<Route['name'], Tab>> = {
    lists: 'plans',
    upcoming: 'plans',
    week: 'plans',
    track: 'plans',
    step: 'plans',
    tracks: 'plans',
    day: 'insights',
    review: 'insights',
    'review-week': 'insights',
    books: 'more',
    games: 'more',
    movies: 'more',
    shows: 'more',
    exercise: 'me',
    recipes: 'more',
    shopping: 'me',
    setup: 'settings',
    goals: 'settings',
    sync: 'settings',
    ai: 'settings',
    link: 'settings',
    join: 'settings',
  }

  /** The four media screens share one component. */
  const isShelf = (name: string): name is Shelf => name === 'books' || name === 'games' || name === 'movies' || name === 'shows'

  const isDate = (value: string | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)

  // Links look like #/today, so GitHub Pages never has to serve anything but index.html.
  function readRoute(): Route {
    const [name, argument] = location.hash.replace(/^#\/?/, '').split('/')
    if (name === 'day' && isDate(argument)) return { name: 'day', date: argument }
    // Tech study, Spanish and drawing became tracks (D83); their old links still open them.
    if (name === 'track' && argument) return { name: 'track', id: argument }
    if (name === 'step' && argument) return { name: 'step', id: argument }
    if (name === 'study' && argument && /^\d+$/.test(argument)) return { name: 'step', id: '', number: Number(argument) }
    if (name === 'study') return { name: 'track', id: TECH_TRACK }
    if (name === 'spanish') return { name: 'track', id: SPANISH_TRACK }
    if (name === 'drawing') return { name: 'track', id: DRAWING_TRACK }
    if (name === 'review' && isDate(argument)) return { name: 'review-week', monday: toISODate(weekStart(parseDate(argument))) }
    if (name === 'link') return { name: 'link', payload: argument ?? '' }
    if (name === 'join') return { name: 'join', payload: argument ?? '' }
    // Projects moved into Lists in M7.
    if (name === 'projects') return { name: 'lists' }
    if (name === 'more') return { name: 'books' }
    // Recipes are a shelf in More too (F61): Cooked, Want to try, favourites.
    if (name === 'recipes') return { name: 'recipes', view: argument === 'want' || argument === 'favorites' ? argument : 'log' }
    // History and Stats became Insights (D65).
    if (name === 'history' || name === 'stats') return { name: 'insights' }
    const screen = SCREENS.find((candidate) => candidate === name)
    // "#/tracks/new" opens a page with its add form ready (F48).
    if (screen && argument === 'new' && !isShelf(screen)) return { name: screen, adding: true }
    if (screen && isShelf(screen)) return { name: screen, view: argument === 'want' || argument === 'done' || argument === 'favorites' ? argument : 'log' }
    return { name: screen ?? 'today' }
  }

  let route = $state<Route>(readRoute())
  let today = $state(todayISO())
  let ready = $state(false)
  let failure = $state<string | null>(null)

  const thisMonday = $derived(toISODate(weekStart(parseDate(today))))
  // More opens on Books, or the first part of More that's turned on (F63).
  const features = live(() => getFeatures, ALL_FEATURES)
  const moreHref = $derived(`#/${(['books', 'games', 'movies', 'shows', 'recipes'] as const).find((key) => features.current[key]) ?? 'books'}`)
  const activeTab = $derived<Tab>(TAB_OF[route.name] ?? (tabs.some((tab) => tab.name === route.name) ? (route.name as Tab) : 'today'))

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

  // A new device first chooses how to start (F62); the rest of the app waits for that.
  let needsStart = $state(false)
  const started = () => (needsStart = false)

  prepareDevice()
    .then((start) => {
      needsStart = start === null
      ready = true
      // Ask the browser to keep the data even when the device runs low on space.
      void navigator.storage?.persist?.()
      // Sync with the server, if this device is connected (M2). With Connect an AI on, the
      // week-by-week summary goes up after it (F74).
      onSynced(scheduleAnalysis)
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
  {:else if route.name === 'link'}
    <Link payload={route.payload} onstarted={started} />
  {:else if route.name === 'join'}
    <Join payload={route.payload} onstarted={started} />
  {:else if needsStart}
    <Welcome onstarted={started} />
  {:else if route.name === 'day'}
    {#key route.date}
      <Day date={route.date} isToday={route.date === today} />
    {/key}
  {:else if route.name === 'track'}
    {#key route.id}
      <Track id={route.id} {today} />
    {/key}
  {:else if route.name === 'step'}
    {#key `${route.id}|${route.number}`}
      <Step id={route.id} number={route.number} {today} />
    {/key}
  {:else if route.name === 'review' || route.name === 'review-week'}
    {@const monday = route.name === 'review-week' ? route.monday : thisMonday}
    {#key monday}
      <Review {monday} {today} />
    {/key}
  {:else if route.name === 'plans'}
    <Plans {today} />
  {:else if route.name === 'lists'}
    <Lists {today} />
  {:else if route.name === 'upcoming'}
    <Upcoming {today} />
  {:else if route.name === 'routines'}
    <Routines {today} />
  {:else if route.name === 'insights'}
    <Insights {today} />
  {:else if route.name === 'me'}
    <Me {today} />
  {:else if route.name === 'settings'}
    <Settings />
  {:else if route.name === 'exercise'}
    <Exercise {today} />
  {:else if route.name === 'week'}
    <Week {today} />
  {:else if route.name === 'shopping'}
    <Shopping />
  {:else if route.name === 'tracks'}
    {@const adding = 'adding' in route && !!route.adding}
    {#key adding}
      <Tracks {today} {adding} />
    {/key}
  {:else if route.name === 'setup'}
    <Setup />
  {:else if route.name === 'recipes'}
    {@const recipeView = 'view' in route && (route.view === 'want' || route.view === 'favorites') ? route.view : 'log'}
    {#key recipeView}
      <Recipes {today} view={recipeView} />
    {/key}
  {:else if isShelf(route.name)}
    {@const shelf = route.name}
    {@const view = 'view' in route ? (route.view ?? 'log') : 'log'}
    {#key `${shelf}|${view}`}
      <Media {shelf} {today} {view} />
    {/key}
  {:else if route.name === 'goals'}
    <Goals {today} />
  {:else if route.name === 'sync'}
    <Sync />
  {:else if route.name === 'ai'}
    <Ai />
  {:else}
    {#key today}
      <Day date={today} isToday />
    {/key}
  {/if}
</main>

<nav class="tabs" aria-label="Screens" hidden={needsStart}>
  {#each tabs as tab (tab.name)}
    <a href={tab.name === 'more' ? moreHref : (tab.href ?? `#/${tab.name}`)} aria-current={activeTab === tab.name ? 'page' : undefined}>
      <Icon name={tab.icon} />
      <span class="tab-label">{tab.label}</span>
    </a>
  {/each}
</nav>
