import { defineConfig, devices } from '@playwright/test';

import { COMPOSE_FILE } from './e2e/stack';

/**
 * End-to-end tests against the real SSR stack.
 *
 * These are e2e rather than unit tests because what they check only exists once
 * the whole chain is assembled: Django resolving a tenant from the Host header,
 * the SSR process rendering with that tenant's data, and the HTML arriving
 * complete *before* any JavaScript runs. A unit test can assert that a
 * component renders a title; only this can assert that a crawler which never
 * executes JavaScript sees it.
 *
 * Ports 4101 and 4102 are the tenant proxy (see e2e/tenant-proxy.mjs), which
 * attaches the right Host header so no hosts-file entries — and no
 * administrator rights — are needed.
 *
 * The backend is started for you: docker-compose.e2e.yml brings up a throwaway
 * Postgres and a Django container seeded with the demo fixtures, and
 * globalTeardown removes it afterwards. The suite asserts on those fixtures, so
 * it must not run against a real database; twelve specs failed for exactly that
 * reason while it pointed at whatever the developer happened to have written.
 *
 * Port 8001 is shared with `manage.py runserver 8001`, so stop yours first.
 * Set E2E_SKIP_STACK=1 to run against a backend you started yourself.
 *
 * The one prerequisite left, because Playwright cannot usefully guess when to
 * rebuild:
 *   cd frontend && npm run build -- --configuration development
 */

export const ALEXANDRA = 'http://localhost:4101';
export const ROAM = 'http://localhost:4102';

export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // A throwaway Postgres and a seeded Django. A webServer rather than
      // globalSetup because globalSetup runs *after* these, and the SSR entry
      // below cannot render its first page until the API answers.
      //
      // reuseExistingServer is false on purpose: if a dev server is already on
      // 8001, Playwright says so instead of quietly testing the wrong data,
      // which is how twelve of these specs came to be "failing".
      command: `docker compose -f "${COMPOSE_FILE}" up --build`,
      url: 'http://127.0.0.1:8001/api/site-config/',
      reuseExistingServer: false,
      // Builds the backend image on a cold cache the first time.
      timeout: 300_000,
    },
    {
      command: 'node dist/writing-frontend/server/server.mjs',
      url: 'http://127.0.0.1:4000/',
      reuseExistingServer: true,
      // Generous because this races the container above: the first render
      // fails until Django is up, and Playwright simply retries until it is.
      timeout: 180_000,
    },
    {
      command: 'node e2e/tenant-proxy.mjs',
      url: `${ALEXANDRA}/`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
