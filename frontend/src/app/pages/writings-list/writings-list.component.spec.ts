import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideStore, Store } from '@ngxs/store';

import { environment } from '../../../environments/environment';
import { LoadPostList } from '../../stores/content/content.actions';
import { ContentState } from '../../stores/content/content.state';
import { LanguageStore } from '../../stores/language.store';
import { SiteConfigStore } from '../../stores/site-config.store';
import { WritingsListComponent } from './writings-list.component';

describe('WritingsListComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTranslateService({ fallbackLang: 'en', lang: 'en' }),
        provideStore([ContentState]),
        SiteConfigStore,
        LanguageStore,
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('creates', () => {
    // No change detection: the constructor effect dispatches a load, and
    // whenStable() would wait on a request nothing has flushed.
    const fixture = TestBed.createComponent(WritingsListComponent);

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders an excerpt as markup, and still sanitizes it', async () => {
    // Loaded before the component exists, so its own effect finds the archive
    // already cached and asks for nothing — which is what lets whenStable()
    // settle here at all.
    TestBed.inject(Store).dispatch(new LoadPostList('en'));
    http.expectOne(`${environment.API_BASE_URL}/posts/?lang=en`).flush({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          slug: 'the-power-of-words',
          title: 'The Power of Words',
          // What an author can now write in the Excerpt field. The <script> is
          // already impossible — Django strips it on save — but the binding
          // sanitizes again, and that second layer is what still stands for a
          // row written before the sanitizer, or by hand in SQL.
          excerpt: '<p>An exploration of <em>language</em>.</p><script>alert(1)</script>',
          published_at: '2026-05-22T00:00:00Z',
          cover_image: null,
          author: { name: 'Alexandra Pintea', slug: 'alexandra-pintea' },
          category: { slug: 'essay', name: 'Essay' },
          available_languages: ['en'],
        },
      ],
    });

    const fixture = TestBed.createComponent(WritingsListComponent);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    // Structural, not textual: a test on textContent alone would pass just as
    // happily with the tags escaped onto the page.
    expect(compiled.querySelector('.preview__excerpt em')?.textContent).toBe('language');
    expect(compiled.querySelector('.preview__excerpt script')).toBeNull();
    expect(compiled.textContent).not.toContain('alert(1)');
  });

  afterEach(() => http.verify());
});
