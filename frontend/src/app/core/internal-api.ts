import { HttpBackend, HttpEvent, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * Sending the server render's API calls to Django directly, instead of out to
 * the internet and back.
 *
 * In production the app asks for `/api/...`, a relative URL, because in the
 * browser the API and the page share an origin. During a server render Angular
 * cannot leave it relative, so `relativeUrlsTransformerInterceptorFn` in
 * @angular/platform-server resolves it against the inbound request — which
 * turns it into `https://alexandrapintea.eu/api/...`. That works, and it is
 * wrong in three ways: every render leaves the machine and comes back through
 * public DNS, nginx and TLS; the render depends on the site's own certificate
 * being valid; and during the DNS cutover, while the domain still points at
 * Squarespace, the server would faithfully fetch *Squarespace* and render a
 * site with no content.
 *
 * The rewrite happens here, at the HTTP backend, rather than where the URL is
 * built. Anything earlier changes the URL the transfer-cache keys itself on, so
 * the server would store its responses under `http://backend:8000/...` while
 * the hydrating browser looks them up under `/...`, miss every one of them, and
 * re-fetch the whole page's data immediately after load. Rewriting last leaves
 * both sides agreeing on a relative key.
 */

const API_PATH = '/api/';

/** Reads the internal origin the SSR process should use, if it was given one. */
export function resolveInternalApiOrigin(): string {
  // Only ever evaluated in the server bundle, where process exists.
  return globalThis.process?.env?.['API_INTERNAL_ORIGIN']?.trim() ?? '';
}

/**
 * Point an API URL at the internal origin. Anything that is not an API call —
 * translations, assets — is returned untouched.
 *
 * `internalOrigin` may carry a path (`http://backend:8000/api`); only its
 * scheme and host are used, so both forms behave the same.
 */
export function internalApiUrl(url: string, internalOrigin: string): string {
  if (!internalOrigin) {
    return url;
  }

  let internal: URL;
  try {
    internal = new URL(internalOrigin);
  } catch {
    return url;
  }

  if (url.startsWith(API_PATH)) {
    return `${internal.protocol}//${internal.host}${url}`;
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return url;
  }
  if (!target.pathname.startsWith(API_PATH)) {
    return url;
  }

  target.protocol = internal.protocol;
  target.host = internal.host;
  return target.toString();
}

/**
 * Wraps the real backend and redirects API traffic to the internal origin.
 */
export class InternalApiBackend implements HttpBackend {
  constructor(
    private readonly inner: HttpBackend,
    private readonly internalOrigin: string,
  ) {}

  handle(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
    const url = internalApiUrl(request.url, this.internalOrigin);
    if (url === request.url) {
      return this.inner.handle(request);
    }

    return this.inner.handle(
      request.clone({
        url,
        // The internal hop is plain HTTP, so Django — which has
        // SECURE_SSL_REDIRECT on — would answer it with a 301 to https and the
        // render would collect a redirect instead of data. This says what is
        // true of the request being rendered: the reader arrived over HTTPS.
        // nginx overwrites the same header on public traffic, so a visitor
        // cannot forge it.
        setHeaders: { 'X-Forwarded-Proto': 'https' },
      }),
    );
  }
}
