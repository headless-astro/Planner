import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { 'cloudflare:workers': fileURLToPath(new URL('./test/cloudflare-workers.ts', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // The OAuth library has to go through Vite to pick up the alias above.
    server: { deps: { inline: ['@cloudflare/workers-oauth-provider'] } },
  },
})
