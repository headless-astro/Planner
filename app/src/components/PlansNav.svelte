<script lang="ts">
  // The three sub-tabs at the top of the Plans tab (F33, F47).
  import Icon from './Icon.svelte'

  let { current }: { current: 'plans' | 'lists' | 'upcoming' } = $props()
</script>

<nav class="subtabs" aria-label="Plans, lists and upcoming">
  <a href="#/plans" aria-current={current === 'plans' ? 'page' : undefined}><Icon name="books" />Plans</a>
  <a href="#/lists" aria-current={current === 'lists' ? 'page' : undefined}><Icon name="files" />Lists</a>
  <a href="#/upcoming" aria-current={current === 'upcoming' ? 'page' : undefined}><Icon name="calendar-check" />Upcoming</a>
</nav>
