import { computed, effect, inject, PLATFORM_ID, REQUEST } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';

import { SiteConfigStore } from './site-config.store';

const STORAGE_KEY = 'preferred-language';

interface LanguageState {
  /** null until site-config arrives and the initial language is resolved. */
  activeLanguage: string | null;
}

const initialState: LanguageState = { activeLanguage: null };

/**
 * The active UI/content language.
 *
 * Deliberately a SignalStore rather than classic NgRx: this slice is one string
 * with no HTTP of its own, and every consumer reads it as a signal.
 *
 * The language is resolved from a different source per platform, because the
 * browser's source does not exist on the server:
 *
 * - Browser: localStorage, so a reader's choice survives across visits.
 * - Server: the inbound request's Accept-Language header, so the first paint is
 *   already in a language the reader is likely to want rather than always the
 *   site default.
 *
 * Consequence worth knowing: those two can disagree. A reader whose stored
 * preference is RO but whose browser sends `Accept-Language: en` gets an
 * English server render that switches to Romanian on hydration. v1 accepts that
 * flicker; the alternative is a cookie the server can read, which is the
 * natural upgrade if it becomes annoying.
 */
export const LanguageStore = signalStore(
  withState(initialState),
  withComputed(({ activeLanguage }) => ({
    /** Never null — falls back to English until site-config resolves. */
    language: computed(() => activeLanguage() ?? 'en'),
    isResolved: computed(() => activeLanguage() !== null),
  })),
  withMethods((store) => {
    const siteConfig = inject(SiteConfigStore);
    const translate = inject(TranslateService);
    const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    // Injected here rather than where it is used: inject() is only legal in an
    // injection context, and the effect in onInit runs outside one.
    const request = inject(REQUEST, { optional: true });

    function apply(code: string): void {
      patchState(store, { activeLanguage: code });
      translate.use(code);
    }

    /** The reader's stored choice, or null. Browser only. */
    function storedLanguage(): string | null {
      if (!isBrowser) {
        return null;
      }
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch {
        // Safari in private mode throws on access rather than returning null.
        return null;
      }
    }

    /** Languages the inbound request asked for, best first. Server only. */
    function requestedLanguages(): string[] {
      const header = request?.headers.get('accept-language');
      if (!header) {
        return [];
      }
      return header
        .split(',')
        .map((entry) => {
          const [tag, quality] = entry.trim().split(';q=');
          return {
            // "ro-RO" and "ro" both mean Romanian to us.
            code: tag.split('-')[0].toLowerCase(),
            quality: quality ? Number(quality) : 1,
          };
        })
        .sort((a, b) => b.quality - a.quality)
        .map((entry) => entry.code);
    }

    return {
      /**
       * Switch language. Ignores codes this site does not enable — a stale
       * bookmark or a hand-edited localStorage value must not put the app into
       * a language it has no strings for.
       */
      setLanguage(code: string): void {
        const enabled = siteConfig.enabledLanguages();
        if (!enabled.includes(code)) {
          console.warn(
            `[LanguageStore] "${code}" is not enabled for this site ` +
              `(enabled: ${enabled.join(', ') || 'not loaded yet'}). Ignoring.`,
          );
          return;
        }
        apply(code);
        if (isBrowser) {
          // Only an explicit choice is persisted. The initial resolution below
          // must not write, or the first visit would silently lock the reader
          // into whatever default they happened to land on.
          try {
            localStorage.setItem(STORAGE_KEY, code);
          } catch {
            // Private mode: the choice still applies for this session.
          }
        }
      },

      /**
       * Pick the initial language. Called from an effect, so it re-runs when
       * site-config arrives and no-ops once a language is set.
       */
      resolveInitialLanguage(): void {
        const enabled = siteConfig.enabledLanguages();
        if (!enabled.length || store.activeLanguage() !== null) {
          return;
        }
        const candidates = isBrowser
          ? [storedLanguage()].filter((code): code is string => code !== null)
          : requestedLanguages();
        const supported = candidates.find((code) => enabled.includes(code));
        apply(supported ?? siteConfig.defaultLanguage());
      },
    };
  }),
  withHooks({
    onInit(store) {
      // enabledLanguages() is empty until /api/site-config/ responds, so this
      // cannot run once at startup — the effect re-runs when the config lands.
      effect(() => store.resolveInitialLanguage());
    },
  }),
);
