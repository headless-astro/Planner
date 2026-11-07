<script lang="ts">
  // The + button that opens an add form (F52). It turns into × while the form is open.
  import Icon from './Icon.svelte'

  let { open = $bindable(false), label }: { open?: boolean; label: string } = $props()
</script>

<button type="button" class="add-toggle" aria-expanded={open} aria-label={open ? `Close: ${label}` : label} title={label} onclick={() => (open = !open)}>
  <Icon name="plus" />
</button>
