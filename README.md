# Planner

A personal daily planner that installs on phone and PC: a Svelte + TypeScript PWA, published to GitHub Pages.

## Develop

```sh
cd app
npm install
npm run dev      # local dev server
npm test         # logic tests
npm run check    # type checks
npm run build    # production build in app/dist
npm run icons    # re-render the PNG icons from public/icon.svg
```

## Publish

Every push to `main` builds and publishes the app through GitHub Actions (`.github/workflows/deploy.yml`).
One-time setup: in the repo's Settings → Pages, set Source to "GitHub Actions".

## Sync server

`worker/` is a Cloudflare Worker with a D1 database. It keeps the synced copy of the data and sends the reminder pings; the app connects to it from More → Sync and reminders.

```sh
cd worker
npm install
npm test           # tests, against an in-memory SQLite database
npm run check      # type checks
npm run db:local   # create the local database, then:
npm run dev        # run it on http://localhost:8787
```

Publish it from your PC: `npx wrangler login`, `npx wrangler d1 create planner` (put the printed id in `wrangler.jsonc`), `npm run db:remote`, then `npm run deploy`.
