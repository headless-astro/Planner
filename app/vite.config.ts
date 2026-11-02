import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

// On GitHub Pages the app lives at https://<user>.github.io/<repo>/, so the base path is the
// repo name. GitHub Actions sets GITHUB_REPOSITORY ("owner/repo"); locally the base is "/".
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = repo && !repo.endsWith('.github.io') ? `/${repo}/` : '/'

export default defineConfig({
  base,
  plugins: [
    svelte(),
    VitePWA({
      // Our own service worker (src/sw.ts), so reminders can be added to it in M2.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Planner',
        short_name: 'Planner',
        description: 'Daily planner',
        lang: 'en',
        display: 'standalone',
        background_color: '#f7f5fc',
        theme_color: '#f7f5fc',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // The manifest and its icons are added to the cache automatically.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
})
