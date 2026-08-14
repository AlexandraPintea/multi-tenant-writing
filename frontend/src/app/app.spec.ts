import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';

import { App } from './app';
import { LanguageStore } from './stores/language.store';
import { SiteConfigStore } from './stores/site-config.store';

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

  it('hides the Authors link unless the site uses the grid layout', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('nav a')).map(
      (a) => a.getAttribute('href'),
    );
    expect(links).not.toContain('/authors');
  });
});
