import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();

/**
 * trustProxyHeaders is not a nicety here — without it the server refuses to
 * render at all behind nginx.
 *
 * Angular treats an unexpected `X-Forwarded-*` header as a possible spoof: it
 * logs "Received x-forwarded-for header but trustProxyHeaders was not set up
 * to allow it" and falls back to serving the bare client shell. The page still
 * works in a browser, so nothing looks broken — but every request returns
 * `<app-root></app-root>` with the default title, which is exactly what a
 * crawler sees, and server-side rendering is the whole reason this process
 * exists. It cost an hour to find in production.
 *
 * Trusting them is correct in this deployment: nginx *sets* those headers on
 * every proxied request rather than passing a client's through, and it is the
 * only thing that can reach this port — the container publishes on
 * 127.0.0.1 only.
 */
const angularApp = new AngularNodeAppEngine({ trustProxyHeaders: true });

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Container health probe.
 *
 * Deliberately not "/": rendering a real page on every check would run the
 * router and call the API each time, which turns a liveness probe into load
 * and makes the container unhealthy whenever the *backend* is down. This
 * answers the narrower question the probe is actually asking — is this process
 * still serving?
 */
app.get('/healthz', (_req, res) => {
  res.status(200).type('text/plain').send('ok');
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;

  // Loud on purpose. Without it the renders still succeed — Angular resolves
  // the relative /api against the inbound request, so the server fetches its
  // own public URL — and the cost is invisible until the day the domain points
  // somewhere else and every page renders empty. See core/internal-api.ts.
  if (!process.env['API_INTERNAL_ORIGIN']) {
    console.warn(
      'API_INTERNAL_ORIGIN is not set: server-side API calls will go out over the public ' +
        'internet and back. Set it to the backend origin, e.g. http://backend:8000.',
    );
  }

  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
