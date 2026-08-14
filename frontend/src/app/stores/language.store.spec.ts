import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { patchState } from '@ngrx/signals';

import { LanguageStore } from './language.store';
import { SiteConfigStore } from './site-config.store';

const STORAGE_KEY = 'preferred-language';

/** Stand in for a loaded /api/site-config/ response. */
function configureSite(enabled: string[], defaultLanguage = 'en') {
  const siteConfig = TestBed.inject(SiteConfigStore);
  patchState(siteConfig as never, {
    config: {
      domain: 'alexandrapintea.eu',
      name: 'Alexandra Pintea',
      theme: {},
      layout: 'editorial',
      enabled_languages: enabled,
      default_language: defaultLanguage,
    },
  });
  return siteConfig;
}

describe('LanguageStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService({ fallbackLang: 'en', lang: 'en' }),
        SiteConfigStore,
        LanguageStore,
      ],
    });
  });

  it('reports English before site-config arrives, without claiming to be resolved', () => {
    const store = TestBed.inject(LanguageStore);
    expect(store.language()).toBe('en');
    expect(store.isResolved()).toBe(false);
  });

  it('adopts the site default once site-config lands', () => {
    const store = TestBed.inject(LanguageStore);
    configureSite(['en', 'ro'], 'ro');
    TestBed.tick();

    expect(store.language()).toBe('ro');
    expect(store.isResolved()).toBe(true);
  });

  it('prefers a stored choice over the site default', () => {
    localStorage.setItem(STORAGE_KEY, 'ro');
    const store = TestBed.inject(LanguageStore);
    configureSite(['en', 'ro'], 'en');
    TestBed.tick();

    expect(store.language()).toBe('ro');
  });

  it('ignores a stored choice the site does not enable', () => {
    // A reader who set RO on alexandrapintea.eu then visits Roam, which is
    // English-only: the stale preference must not win.
    localStorage.setItem(STORAGE_KEY, 'ro');
    const store = TestBed.inject(LanguageStore);
    configureSite(['en'], 'en');
    TestBed.tick();

    expect(store.language()).toBe('en');
  });

  it('setLanguage switches the language and persists the choice', () => {
    const store = TestBed.inject(LanguageStore);
    configureSite(['en', 'ro'], 'en');
    TestBed.tick();

    store.setLanguage('ro');

    expect(store.language()).toBe('ro');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('ro');
    expect(TestBed.inject(TranslateService).getCurrentLang()).toBe('ro');
  });

  it('rejects a language the site does not enable, and does not persist it', () => {
    const store = TestBed.inject(LanguageStore);
    configureSite(['en'], 'en');
    TestBed.tick();

    store.setLanguage('ro');

    expect(store.language()).toBe('en');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does not persist the initial resolution, only an explicit choice', () => {
    const store = TestBed.inject(LanguageStore);
    configureSite(['en', 'ro'], 'en');
    TestBed.tick();

    // Landing on the default must not lock the reader into it.
    expect(store.language()).toBe('en');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
