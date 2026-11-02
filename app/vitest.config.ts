import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Logic tests and screen tests. Screens are mounted in happy-dom, a simulated browser,
// so Svelte must resolve to its browser build. fake-indexeddb stands in for the database.
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ['browser'],
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
    setupFiles: ['src/test-setup.ts'],
  },
})
