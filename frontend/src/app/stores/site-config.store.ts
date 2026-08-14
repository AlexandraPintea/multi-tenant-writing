import { computed, effect, inject, PLATFORM_ID, REQUEST } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

import { environment } from '../../environments/environment';

/** Shape of GET /api/site-config/ — mirrors SiteConfigSerializer on the backend. */
export interface SiteConfig {
  domain: string;
  name: string;
  /** CSS custom properties to apply to :root (theme_config minus the `layout` key). */
  theme: Record<string, string>;
  layout: string | null;
  enabled_languages: string[];
  default_language: string;
}

interface SiteConfigState {
  config: SiteConfig | null;
  loading: boolean;
  error: string | null;
}

const initialState: SiteConfigState = {
  config: null,
  loading: false,
  error: null,
};

/**
 * The active tenant is identified by domain. In the browser that's the live
 * host; during SSR there is no `window`, so we read the inbound request's Host
 * header (the REQUEST token, populated by @angular/ssr) and forward it as
 * X-Site-Domain — the same header the middleware prefers over Host.
 */
function resolveSiteDomain(): string {
  const platformId = inject(PLATFORM_ID);
  if (isPlatformBrowser(platformId)) {
    return window.location.host;
  }
  const request = inject(REQUEST, { optional: true });
  return request?.headers.get('host') ?? '';
}

export const SiteConfigStore = signalStore(
  withState(initialState),
  withComputed(({ config }) => ({
    theme: computed(() => config()?.theme ?? {}),
    layout: computed(() => config()?.layout ?? null),
    enabledLanguages: computed(() => config()?.enabled_languages ?? []),
    defaultLanguage: computed(() => config()?.default_language ?? 'en'),
  })),
  withMethods((store) => {
    const http = inject(HttpClient);
    const siteDomain = resolveSiteDomain();

    return {
      loadSiteConfig(): void {
        patchState(store, { loading: true, error: null });
        http
          .get<SiteConfig>(`${environment.API_BASE_URL}/site-config/`, {
            headers: { 'X-Site-Domain': siteDomain },
          })
          .subscribe({
            next: (config) => patchState(store, { config, loading: false }),
            error: (err) =>
              patchState(store, {
                loading: false,
                error: err?.message ?? 'Failed to load site config',
              }),
          });
      },
    };
  }),
  withHooks({
    onInit(store) {
      const platformId = inject(PLATFORM_ID);
      // Theme is a side effect on document.documentElement — meaningless during
      // SSR (the server response carries no live <html> we mutate here), so the
      // effect only runs in the browser.
      if (!isPlatformBrowser(platformId)) {
        return;
      }
      const root = inject(DOCUMENT).documentElement;
      effect(() => {
        for (const [property, value] of Object.entries(store.theme())) {
          root.style.setProperty(property, value);
        }
      });
    },
  }),
);