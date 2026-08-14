import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { siteDomainInterceptor } from './site-domain';

/**
 * Guards the bug this interceptor was written for: a content request without
 * X-Site-Domain does not fail, it silently returns the *other* tenant's
 * content, because Django falls back to DEFAULT_SITE_DOMAIN for an
 * unrecognised host.
 */
describe('siteDomainInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([siteDomainInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('stamps every API request with the current host', () => {
    http.get(`${environment.API_BASE_URL}/posts/`).subscribe();

    const request = controller.expectOne(`${environment.API_BASE_URL}/posts/`);
    // In the browser test environment that is the karma/vitest host.
    expect(request.request.headers.get('X-Site-Domain')).toBe(window.location.host);
    request.flush({ count: 0, next: null, previous: null, results: [] });
  });

  it('leaves non-API requests alone', () => {
    http.get('/i18n/en.json').subscribe();

    const request = controller.expectOne('/i18n/en.json');
    expect(request.request.headers.has('X-Site-Domain')).toBe(false);
    request.flush({});
  });
});
