import { liveQuery } from 'dexie'

/**
 * A database query as a reactive value. It re-runs whenever the data it read changes, and
 * whenever a reactive value read inside `makeQuery` changes (read those before returning the
 * query function). Call it while a component is being set up.
 */
export function live<T>(makeQuery: () => () => Promise<T>, initial: T): { readonly current: T } {
  let current = $state(initial)

  $effect(() => {
    const query = makeQuery()
    const subscription = liveQuery(query).subscribe({
      next: (value) => {
        current = value
      },
      error: (error) => console.error(error),
    })
    return () => subscription.unsubscribe()
  })

  return {
    get current() {
      return current
    },
  }
}
