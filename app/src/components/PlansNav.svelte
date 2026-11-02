<script lang="ts">
  // The two sub-tabs at the top of the Plans tab (F33).
  import Icon from './Icon.svelte'

  let { current }: { current: 'plans' | 'lists' } = $props()
</script>

<nav class="subtabs" aria-label="Plans and lists">
  <a href="#/plans" aria-current={current === 'plans' ? 'page' : undefined}><Icon name="books" />Plans</a>
  <a href="#/lists" aria-current={current === 'lists' ? 'page' : undefined}><Icon name="files" />Lists</a>
</nav>
