import {
  HttpBackend,
  HttpEvent,
  HttpHeaders,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { Observable, of } from 'rxjs';

import { InternalApiBackend, internalApiUrl, resolveInternalApiOrigin } from './internal-api';

const INTERNAL = 'http://backend:8000';

describe('internalApiUrl', () => {
  it('sends an absolute API url to the internal origin', () => {
    expect(internalApiUrl('https://alexandrapintea.eu/api/posts/?lang=en', INTERNAL)).toBe(
      'http://backend:8000/api/posts/?lang=en',
    );
  });

  it('sends a relative API url to the internal origin', () => {
    expect(internalApiUrl('/api/site-config/', INTERNAL)).toBe(
      'http://backend:8000/api/site-config/',
    );
  });

  it('ignores the path on the configured origin', () => {
    // The variable is easy to write as .../api by analogy with API_BASE_URL;
    // taking only scheme and host means that spelling still works.
    expect(internalApiUrl('/api/posts/', 'http://backend:8000/api')).toBe(
      'http://backend:8000/api/posts/',
    );
  });

  it('leaves everything that is not an API call alone', () => {
    expect(internalApiUrl('/i18n/en.json', INTERNAL)).toBe('/i18n/en.json');
    expect(internalApiUrl('https://alexandrapintea.eu/i18n/ro.json', INTERNAL)).toBe(
      'https://alexandrapintea.eu/i18n/ro.json',
    );
    // /apidocs/ is not /api/ — a prefix match would have taken it.
    expect(internalApiUrl('https://alexandrapintea.eu/apidocs/', INTERNAL)).toBe(
      'https://alexandrapintea.eu/apidocs/',
    );
  });

  it('changes nothing when no internal origin is configured', () => {
    // Development and any deployment without the variable set: the app keeps
    // whatever URL it had rather than failing.
    expect(internalApiUrl('/api/posts/', '')).toBe('/api/posts/');
  });
});

describe('resolveInternalApiOrigin', () => {
  const original = process.env['API_INTERNAL_ORIGIN'];

  afterEach(() => {
    if (original === undefined) {
      delete process.env['API_INTERNAL_ORIGIN'];
    } else {
      process.env['API_INTERNAL_ORIGIN'] = original;
    }
  });

  it('reads the environment variable', () => {
    process.env['API_INTERNAL_ORIGIN'] = ' http://backend:8000 ';
    expect(resolveInternalApiOrigin()).toBe('http://backend:8000');
  });

  it('is empty when unset', () => {
    delete process.env['API_INTERNAL_ORIGIN'];
    expect(resolveInternalApiOrigin()).toBe('');
  });
});

describe('InternalApiBackend', () => {
  let handled: HttpRequest<unknown>[];
  let inner: HttpBackend;

  beforeEach(() => {
    handled = [];
    inner = {
      handle(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> {
        handled.push(request);
        return of(new HttpResponse({ status: 200 }));
      },
    };
  });

  it('rewrites API requests and marks the hop as having arrived over HTTPS', () => {
    const backend = new InternalApiBackend(inner, INTERNAL);

    backend
      .handle(
        new HttpRequest('GET', '/api/posts/', {
          headers: new HttpHeaders({ 'X-Site-Domain': 'roamliterary.com' }),
        }),
      )
      .subscribe();

    expect(handled[0].url).toBe('http://backend:8000/api/posts/');
    // Django has SECURE_SSL_REDIRECT on, and the internal hop is plain HTTP.
    expect(handled[0].headers.get('X-Forwarded-Proto')).toBe('https');
    // The tenant header is what stops Django serving the other site's content,
    // so the rewrite must not drop it.
    expect(handled[0].headers.get('X-Site-Domain')).toBe('roamliterary.com');
  });

  it('passes non-API requests through untouched', () => {
    const backend = new InternalApiBackend(inner, INTERNAL);
    const request = new HttpRequest('GET', '/i18n/en.json');

    backend.handle(request).subscribe();

    expect(handled[0]).toBe(request);
    expect(handled[0].headers.has('X-Forwarded-Proto')).toBe(false);
  });

  it('passes everything through when no internal origin is configured', () => {
    const backend = new InternalApiBackend(inner, '');
    const request = new HttpRequest('GET', '/api/posts/');

    backend.handle(request).subscribe();

    expect(handled[0]).toBe(request);
  });
});
