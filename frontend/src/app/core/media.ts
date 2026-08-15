import { environment } from '../../environments/environment';

/**
 * Resolve a media path from the API into something the browser can actually load.
 *
 * Django serialises uploads root-relative ("/media/posts/covers/x.jpg"). In
 * production nginx serves /media from the same origin as the app, so the path is
 * already right and is left alone — keeping it relative also means the HTML does
 * not hard-code a hostname.
 *
 * In development the API lives on another port, and a root-relative path
 * resolves against the dev server instead. Nothing serves /media there, and the
 * dev server answers unknown paths with index.html, so the browser receives HTML
 * where it expected a JPEG and the image silently fails to render — no console
 * error, just a blank box.
 *
 * apiBaseUrl is a parameter so tests can exercise both deployments; production
 * code should always take the default.
 */
export function mediaUrl(
  path: string | null | undefined,
  apiBaseUrl: string = environment.API_BASE_URL,
): string {
  if (!path) {
    return '';
  }
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const apiOrigin = apiBaseUrl.replace(/\/api\/?$/, '');
  // A relative API base means the API shares our origin, so /media does too.
  if (!/^https?:\/\//.test(apiOrigin)) {
    return path;
  }
  return `${apiOrigin}${path.startsWith('/') ? path : `/${path}`}`;
}
