import { computed, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, ResolveFn } from '@angular/router';
import { Store } from '@ngxs/store';
import { filter, Observable, switchMap, take } from 'rxjs';

import {
  LoadAuthorDetail,
  LoadAuthorList,
  LoadPage,
  LoadPostDetail,
  LoadPostList,
} from '../stores/content/content.actions';
import { LanguageStore } from '../stores/language.store';
import { SiteConfigStore } from '../stores/site-config.store';

/**
 * Functional resolvers, not class-based Resolve services.
 *
 * The functional form runs in an injection context, so it uses inject() and
 * needs no @Injectable class, no providers entry and no constructor wiring —
 * a resolver becomes an ordinary function that happens to be reachable from
 * the route config. Class Resolve services are deprecated in Angular for
 * exactly that reason: they were a DI ceremony around a single method.
 *
 * Returning the dispatch observable matters more than it looks: the router
 * waits for it, so during SSR the HTML is rendered with the content already in
 * the store rather than empty with a client-side fetch to follow. That is the
 * whole point of server rendering here — see architecture §5.4.
 */

/**
 * Emits the active language once it is genuinely resolved.
 *
 * Ordering trap: LanguageStore falls back to 'en' until /api/site-config/ has
 * arrived and told it what the site enables. Dispatching on that fallback
 * would fetch the English archive on a Romanian first paint. So this waits for
 * isResolved(), not merely for a language value to exist.
 */
function activeLanguage(): Observable<string> {
  const siteConfig = inject(SiteConfigStore);
  const languageStore = inject(LanguageStore);

  // Idempotent — the store ignores repeat calls while one is in flight.
  siteConfig.loadSiteConfig();

  const resolved = computed(() => (languageStore.isResolved() ? languageStore.language() : null));
  return toObservable(resolved).pipe(
    filter((language): language is string => language !== null),
    take(1),
  );
}

export const postListResolver: ResolveFn<unknown> = () => {
  const store = inject(Store);
  return activeLanguage().pipe(switchMap((lang) => store.dispatch(new LoadPostList(lang))));
};

export const postDetailResolver: ResolveFn<unknown> = (route: ActivatedRouteSnapshot) => {
  const store = inject(Store);
  const slug = route.paramMap.get('slug')!;
  return activeLanguage().pipe(switchMap((lang) => store.dispatch(new LoadPostDetail(slug, lang))));
};

export const authorListResolver: ResolveFn<unknown> = () => {
  const store = inject(Store);
  return activeLanguage().pipe(switchMap((lang) => store.dispatch(new LoadAuthorList(lang))));
};

export const authorDetailResolver: ResolveFn<unknown> = (route: ActivatedRouteSnapshot) => {
  const store = inject(Store);
  const slug = route.paramMap.get('slug')!;
  return activeLanguage().pipe(
    switchMap((lang) => store.dispatch(new LoadAuthorDetail(slug, lang))),
  );
};

/** Static pages carry their slug in route data, not the URL. */
export const pageResolver: ResolveFn<unknown> = (route: ActivatedRouteSnapshot) => {
  const store = inject(Store);
  const slug = route.data['pageSlug'] as string;
  return activeLanguage().pipe(switchMap((lang) => store.dispatch(new LoadPage(slug, lang))));
};
