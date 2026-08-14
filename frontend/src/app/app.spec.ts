import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
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

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Hello, writing-frontend');
  });

  it('hides the language toggle until site-config reports a second language', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    // enabledLanguages() is empty while the request is outstanding, so there is
    // no "other" language to offer yet.
    expect(compiled.querySelector('.language-demo button')).toBeNull();
  });
});
