import { defineConfig, devices } from '@playwright/test';

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
 * Prerequisites the suite cannot start for you:
 *   docker compose up -d
 *   cd backend && python manage.py runserver 8001
 *   cd frontend && npm run build -- --configuration development
 */

export const ALEXANDRA = 'http://localhost:4101';
export const ROAM = 'http://localhost:4102';

export default defineConfig({
  testDir: './e2e',
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
      command: 'node dist/writing-frontend/server/server.mjs',
      url: 'http://127.0.0.1:4000/',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'node e2e/tenant-proxy.mjs',
      url: `${ALEXANDRA}/`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
