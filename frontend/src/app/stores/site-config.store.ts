import { computed, effect, inject, PLATFORM_ID } from '@angular/core';
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

    return {
      /**
       * Fetch once. Route resolvers call this on every navigation to make sure
       * the tenant is known before they dispatch, so repeat calls must not
       * re-hit the API or restart an in-flight request.
       */
      loadSiteConfig(): void {
        if (store.config() !== null || store.loading()) {
          return;
        }
        patchState(store, { loading: true, error: null });
        // X-Site-Domain is added by siteDomainInterceptor, so every API call
        // carries it — not just this one.
        http.get<SiteConfig>(`${environment.API_BASE_URL}/site-config/`).subscribe({
          next: (config) => patchState(store, { config, loading: false }),
          error: (err) => {
            // Also log: without this the failure is invisible, and a failed
            // load during SSR just renders the fallback theme and default
            // language as if nothing were wrong.
            console.error('[SiteConfigStore] /api/site-config/ failed:', err);
            patchState(store, {
              loading: false,
              error: err?.message ?? 'Failed to load site config',
            });
          },
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
