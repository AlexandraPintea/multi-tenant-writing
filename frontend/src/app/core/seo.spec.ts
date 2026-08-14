import { DOCUMENT } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { patchState } from '@ngrx/signals';

import { SeoService } from './seo';
import { LanguageStore } from '../stores/language.store';
import { SiteConfigStore } from '../stores/site-config.store';

describe('SeoService', () => {
  let seo: SeoService;
  let meta: Meta;
  let document: Document;

  function content(selector: string): string | null {
    return meta.getTag(selector)?.getAttribute('content') ?? null;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTranslateService({ fallbackLang: 'en', lang: 'en' }),
        SiteConfigStore,
        LanguageStore,
      ],
    });
    patchState(TestBed.inject(SiteConfigStore) as never, {
      config: {
        domain: 'alexandrapintea.eu',
        name: 'Alexandra Pintea',
        theme: {},
        layout: 'editorial',
        enabled_languages: ['en', 'ro'],
        default_language: 'en',
      },
    });
    seo = TestBed.inject(SeoService);
    meta = TestBed.inject(Meta);
    document = TestBed.inject(DOCUMENT);
  });

  afterEach(() => {
    document.head.querySelector('link[rel="canonical"]')?.remove();
  });

  it('appends the site name to the page title', () => {
    seo.apply({ title: 'The Power of Words', path: '/writings/x' });
    expect(TestBed.inject(Title).getTitle()).toBe('The Power of Words · Alexandra Pintea');
  });

  it('uses the site name alone on the home page', () => {
    seo.apply({ title: '', path: '/' });
    expect(TestBed.inject(Title).getTitle()).toBe('Alexandra Pintea');
  });

  it('emits absolute og:url and canonical', () => {
    seo.apply({ title: 'X', path: '/writings/x' });

    const url = content('property="og:url"');
    expect(url).toMatch(/^https?:\/\//);
    expect(url).toContain('/writings/x');
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(url);
  });

  it('falls back to the summary card when a post has no cover image', () => {
    seo.apply({ title: 'X', description: 'Y', image: null, path: '/x' });

    // summary_large_image with no image unfurls as an empty banner.
    expect(content('name="twitter:card"')).toBe('summary');
    expect(meta.getTag('property="og:image"')).toBeNull();
  });

  it('uses the large card once there is an image, and makes it absolute', () => {
    seo.apply({
      title: 'X',
      image: '/media/posts/covers/x.jpg',
      path: '/x',
    });

    expect(content('name="twitter:card"')).toBe('summary_large_image');
    expect(content('property="og:image"')).toMatch(/^https?:\/\/.*\/media\/posts\/covers\/x\.jpg$/);
  });

  it('removes a stale image when navigating to a post without one', () => {
    seo.apply({ title: 'With', image: '/media/a.jpg', path: '/a' });
    seo.apply({ title: 'Without', image: null, path: '/b' });

    // Otherwise the second post unfurls with the first one's picture.
    expect(meta.getTag('property="og:image"')).toBeNull();
    expect(content('name="twitter:card"')).toBe('summary');
  });

  it('marks a post as an article and everything else as a website', () => {
    seo.apply({ title: 'Post', type: 'article', path: '/writings/x' });
    expect(content('property="og:type"')).toBe('article');

    seo.apply({ title: 'Page', path: '/about' });
    expect(content('property="og:type"')).toBe('website');
  });

  it('reports the active language as og:locale', () => {
    TestBed.inject(LanguageStore).setLanguage('ro');
    seo.apply({ title: 'X', path: '/x' });
    expect(content('property="og:locale"')).toBe('ro');
  });
});
