import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { patchState } from '@ngrx/signals';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideStore } from '@ngxs/store';

import { App } from './app';
import { ContentState } from './stores/content/content.state';
import { LanguageStore } from './stores/language.store';
import { SiteConfig, SiteConfigStore } from './stores/site-config.store';

function configureSite(logo: string | null) {
  const config: SiteConfig = {
    domain: 'alexandrapintea.eu',
    name: 'Alexandra Pintea',
    logo,
    theme: {},
    layout: 'editorial',
    enabled_languages: ['en'],
    default_language: 'en',
  };
  patchState(TestBed.inject(SiteConfigStore) as never, { config });
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        // App injects both stores; without them the TestBed throws NG0201.
        // HttpClientTesting keeps loadSiteConfig() from hitting the network.
        provideHttpClient(),
        provideHttpClientTesting(),
        // The shell renders router-outlet and routerLink, so it needs a router
        // even though these tests never navigate.
        provideRouter([]),
        provideTranslateService({ fallbackLang: 'en', lang: 'en' }),
        // The header embeds LanguageToggle, which reads the content slice.
        provideStore([ContentState]),
        SiteConfigStore,
        LanguageStore,
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the shared header with a router outlet', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.site-header')).not.toBeNull();
    expect(compiled.querySelector('.site-main')).not.toBeNull();
  });

  it('hides the language toggle until site-config reports a second language', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    // enabledLanguages() is empty while the request is outstanding, so there is
    // no "other" language to offer yet.
    expect(compiled.querySelector('.site-header__language')).toBeNull();
  });

  it('renders the logo when the site has one, with the name as its alt text', async () => {
    const fixture = TestBed.createComponent(App);
    configureSite('/media/sites/logos/wordmark.png');
    await fixture.whenStable();

    const logo = (fixture.nativeElement as HTMLElement).querySelector('.site-header__logo');
    // mediaUrl leaves the path alone when the API is same-origin, which is what
    // the test environment's production environment.ts says.
    expect(logo?.getAttribute('src')).toBe('/media/sites/logos/wordmark.png');
    expect(logo?.getAttribute('alt')).toBe('Alexandra Pintea');
  });

  it('falls back to the site name when there is no logo', async () => {
    const fixture = TestBed.createComponent(App);
    configureSite(null);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.site-header__logo')).toBeNull();
    expect(compiled.querySelector('.site-header__wordmark')?.textContent?.trim()).toBe(
      'Alexandra Pintea',
    );
  });

  it('hides the Authors link unless the site uses the grid layout', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('nav a')).map(
      (a) => a.getAttribute('href'),
    );
    expect(links).not.toContain('/authors');
  });
});
