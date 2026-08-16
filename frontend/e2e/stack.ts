import { execSync } from 'node:child_process';
import { join } from 'node:path';

// __dirname, not import.meta: Playwright compiles this hook to CommonJS, where
// import.meta is a syntax error.
export const COMPOSE_FILE = join(__dirname, '..', '..', 'docker-compose.e2e.yml');

/**
 * Removes the e2e backend after the run.
 *
 * Playwright starts the stack as a `webServer`, which is the only hook that
 * runs early enough — globalSetup happens *after* the web servers, so a
 * backend started there would not exist yet when the SSR server tried its
 * first render. But killing `docker compose up` does not reliably stop what it
 * started, so the teardown is explicit here.
 *
 * Set E2E_SKIP_STACK=1 to run against a backend you started yourself.
 */
export function stopStack(): void {
  if (process.env['E2E_SKIP_STACK']) {
    return;
  }
  // --volumes: the database is a tmpfs mount and anything alongside it is
  // equally disposable. Never point this at docker-compose.prod.yml.
  execSync(`docker compose -f "${COMPOSE_FILE}" down --volumes`, { stdio: 'inherit' });
}
