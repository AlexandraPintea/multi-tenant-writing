import { isPlatformBrowser } from '@angular/common';
import { HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID, REQUEST } from '@angular/core';

import { environment } from '../../environments/environment';

/**
 * The domain identifying the current tenant.
 *
 * In the browser that is the live host. During SSR there is no `window`, so it
 * comes from the inbound request's Host header — the same header nginx
 * preserves precisely so the tenant survives the proxy hop.
 */
export function resolveSiteDomain(): string {
  if (isPlatformBrowser(inject(PLATFORM_ID))) {
    return window.location.host;
  }
  return inject(REQUEST, { optional: true })?.headers.get('host') ?? '';
}

/**
 * Stamps X-Site-Domain on every call to our API.
 *
 * An interceptor rather than a header on each request, because forgetting it is
 * silent and severe: Django's SiteMiddleware falls back to DEFAULT_SITE_DOMAIN
 * for an unrecognised host, so an unstamped call does not fail — it quietly
 * returns the *other* tenant's content. That is exactly what happened when only
 * SiteConfigStore set the header: roamliterary.com rendered the grid layout
 * correctly but filled it with alexandrapintea.eu's author.
 *
 * It matters most during SSR, where every request reaches Django from the Node
 * process on 127.0.0.1 and the Host header says nothing about the tenant.
 */
export const siteDomainInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(environment.API_BASE_URL)) {
    return next(request);
  }
  const domain = resolveSiteDomain();
  if (!domain) {
    return next(request);
  }
  return next(request.clone({ setHeaders: { 'X-Site-Domain': domain } }));
};
