import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { siteDomainInterceptor } from '../core/site-domain';
import { SiteConfigStore } from './site-config.store';

const URL = `${environment.API_BASE_URL}/site-config/`;

const RESPONSE = {
  domain: 'alexandrapintea.eu',
  name: 'Alexandra Pintea',
  theme: { '--accent': '#5b3a29', '--font-display': "'Source Serif Pro', serif" },
  layout: 'editorial',
  enabled_languages: ['en', 'ro'],
  default_language: 'en',
};

describe('SiteConfigStore', () => {
  let store: InstanceType<typeof SiteConfigStore>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([siteDomainInterceptor])),
        provideHttpClientTesting(),
        SiteConfigStore,
      ],
    });
    store = TestBed.inject(SiteConfigStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the tenant domain with the request', () => {
    store.loadSiteConfig();

    const request = http.expectOne(URL);
    expect(request.request.headers.get('X-Site-Domain')).toBe(window.location.host);
    request.flush(RESPONSE);
  });

  it('exposes theme, layout and languages once the response lands', () => {
    store.loadSiteConfig();
    http.expectOne(URL).flush(RESPONSE);

    expect(store.theme()['--accent']).toBe('#5b3a29');
    expect(store.layout()).toBe('editorial');
    expect(store.enabledLanguages()).toEqual(['en', 'ro']);
    expect(store.defaultLanguage()).toBe('en');
  });

  it('serves safe fallbacks before the response arrives', () => {
    // Components render during SSR before this resolves, so the getters must
    // never be undefined — an empty enabledLanguages is what hides the toggle.
    expect(store.theme()).toEqual({});
    expect(store.layout()).toBeNull();
    expect(store.enabledLanguages()).toEqual([]);
    expect(store.defaultLanguage()).toBe('en');
  });

  it('fetches once, however many times it is asked', () => {
    // Route resolvers call this on every navigation.
    store.loadSiteConfig();
    http.expectOne(URL).flush(RESPONSE);

    store.loadSiteConfig();
    http.expectNone(URL);
  });

  it('does not start a second request while one is in flight', () => {
    store.loadSiteConfig();
    store.loadSiteConfig();

    // expectOne throws if a second matching request was made.
    http.expectOne(URL).flush(RESPONSE);
  });

  it('records the error instead of throwing', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    store.loadSiteConfig();
    http.expectOne(URL).flush('nope', { status: 500, statusText: 'Server Error' });

    expect(store.error()).toBeTruthy();
    expect(store.loading()).toBe(false);
    // Fallbacks still hold, so the shell renders unthemed rather than blank.
    expect(store.enabledLanguages()).toEqual([]);
  });
});
