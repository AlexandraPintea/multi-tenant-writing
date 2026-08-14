import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { patchState } from '@ngrx/signals';
import { provideStore, Store } from '@ngxs/store';

import { LoadPostDetail } from '../../stores/content/content.actions';
import { ContentState } from '../../stores/content/content.state';
import { LanguageStore } from '../../stores/language.store';
import { SiteConfigStore } from '../../stores/site-config.store';
import { LanguageToggle } from './language-toggle';

/**
 * The four states from architecture §4.3, asserted through aria rather than
 * through CSS: dimming is the visual half, but aria-disabled is what actually
 * tells a screen reader the option is inert.
 */
/** The toggle reads router.url, so navigation has to actually match something. */
@Component({ template: '' })
class Blank {}

describe('LanguageToggle', () => {
  let fixture: ComponentFixture<LanguageToggle>;

  function configureSite(enabled: string[], defaultLanguage = 'en') {
    patchState(TestBed.inject(SiteConfigStore) as never, {
      config: {
        domain: 'alexandrapintea.eu',
        name: 'Alexandra Pintea',
        theme: {},
        layout: 'editorial',
        enabled_languages: enabled,
        default_language: defaultLanguage,
      },
    });
  }

  /** Teach the store which languages a post has, as a 404-with-hint would. */
  function knownAvailability(slug: string, languages: string[]) {
    const store = TestBed.inject(Store);
    const snapshot = store.snapshot();
    store.reset({
      ...snapshot,
      content: {
        ...snapshot['content'],
        availableLanguages: { [slug]: languages },
      },
    });
  }

  function options() {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.language-toggle__option'),
    ) as HTMLButtonElement[];
  }

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', component: Blank }]),
        provideTranslateService({ fallbackLang: 'en', lang: 'en' }),
        provideStore([ContentState]),
        SiteConfigStore,
        LanguageStore,
      ],
    });
    // The HTTP loader is mocked, so nothing would be loaded and instant()
    // would hand back the key. Seed the strings the tooltip needs.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      toggle: { unavailable: 'This piece is only available in {{language}}.' },
      language: { en: 'English', ro: 'Romanian' },
    });
    translate.use('en');

    fixture = TestBed.createComponent(LanguageToggle);
  });

  it('renders nothing on a single-language site', async () => {
    configureSite(['en']);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.language-toggle')).toBeNull();
  });

  it('state 1 — writings list: both options live, neither disabled', async () => {
    configureSite(['en', 'ro']);
    await TestBed.inject(Router).navigateByUrl('/writings');
    await fixture.whenStable();

    const [en, ro] = options();
    expect(en.getAttribute('aria-current')).toBe('true');
    expect(ro.getAttribute('aria-current')).toBeNull();
    expect(en.getAttribute('aria-disabled')).toBeNull();
    expect(ro.getAttribute('aria-disabled')).toBeNull();
  });

  it('state 2 — bilingual post: both options live', async () => {
    configureSite(['en', 'ro']);
    knownAvailability('the-power-of-words', ['en', 'ro']);
    await TestBed.inject(Router).navigateByUrl('/writings/the-power-of-words');
    await fixture.whenStable();

    expect(options().every((button) => button.getAttribute('aria-disabled') === null)).toBe(true);
  });

  it('state 3 — English-only post: the Romanian option is disabled with a tooltip', async () => {
    configureSite(['en', 'ro']);
    knownAvailability('writing-in-the-margins', ['en']);
    await TestBed.inject(Router).navigateByUrl('/writings/writing-in-the-margins');
    await fixture.whenStable();

    const [en, ro] = options();
    expect(en.getAttribute('aria-current')).toBe('true');
    expect(ro.getAttribute('aria-disabled')).toBe('true');
    expect(ro.getAttribute('title')).toContain('only available in English');
  });

  it('clicking the disabled option does nothing', async () => {
    configureSite(['en', 'ro']);
    knownAvailability('writing-in-the-margins', ['en']);
    await TestBed.inject(Router).navigateByUrl('/writings/writing-in-the-margins');
    await fixture.whenStable();

    options()[1].click();
    await fixture.whenStable();

    // Still English, and nothing was written to the stored preference.
    expect(TestBed.inject(LanguageStore).language()).toBe('en');
    expect(localStorage.getItem('preferred-language')).toBeNull();
  });

  it('clicking an available option switches and persists', async () => {
    configureSite(['en', 'ro']);
    await TestBed.inject(Router).navigateByUrl('/writings');
    await fixture.whenStable();

    options()[1].click();
    await fixture.whenStable();

    expect(TestBed.inject(LanguageStore).language()).toBe('ro');
    expect(localStorage.getItem('preferred-language')).toBe('ro');
  });

  it('dims nothing while a post has not loaded yet', async () => {
    configureSite(['en', 'ro']);
    await TestBed.inject(Router).navigateByUrl('/writings/not-loaded-yet');
    await fixture.whenStable();

    // Empty availability means "unknown", not "no translations" — guessing
    // would flash a disabled control on every navigation.
    expect(options().every((button) => button.getAttribute('aria-disabled') === null)).toBe(true);
  });

  it('never disables the option the reader is already on', async () => {
    configureSite(['en', 'ro']);
    knownAvailability('romanian-only', ['ro']);
    TestBed.inject(LanguageStore).setLanguage('ro');
    await TestBed.inject(Router).navigateByUrl('/writings/romanian-only');
    await fixture.whenStable();

    const active = options().find((button) => button.getAttribute('aria-current') === 'true');
    expect(active?.getAttribute('aria-disabled')).toBeNull();
  });

  it('ignores the list route when deciding availability', async () => {
    configureSite(['en', 'ro']);
    knownAvailability('writings', ['en']);
    await TestBed.inject(Router).navigateByUrl('/writings');
    await fixture.whenStable();

    // /writings is the archive, not a post whose slug happens to be "writings".
    expect(options().every((button) => button.getAttribute('aria-disabled') === null)).toBe(true);
  });

  it('keeps the LoadPostDetail action type stable for the store contract', () => {
    expect(new LoadPostDetail('slug', 'en').lang).toBe('en');
  });
});
