import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { provideStore, Store } from '@ngxs/store';

import { environment } from '../../../environments/environment';
import { LoadPostDetail } from '../../stores/content/content.actions';
import { ContentState } from '../../stores/content/content.state';
import { LanguageStore } from '../../stores/language.store';
import { SiteConfigStore } from '../../stores/site-config.store';
import { PostDetailComponent } from './post-detail.component';

/**
 * The three states a post page can be in. The third one — present on this site
 * but not in this language — is the reason the API answers a missing
 * translation with a 404 that carries available_languages.
 */
describe('PostDetailComponent', () => {
  let fixture: ComponentFixture<PostDetailComponent>;
  let http: HttpTestingController;

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

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

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      post: { notInLanguage: 'This piece is only available in {{languages}}.' },
      language: { en: 'English', ro: 'Romanian' },
      common: { notFound: 'Not found.' },
      writings: { title: 'Writings' },
    });
    translate.use('en');

    fixture = TestBed.createComponent(PostDetailComponent);
    fixture.componentRef.setInput('slug', 'the-power-of-words');
  });

  afterEach(() => http.verify());

  function flushPost(body: string): void {
    TestBed.inject(Store).dispatch(new LoadPostDetail('the-power-of-words', 'en'));
    http.expectOne(`${environment.API_BASE_URL}/posts/the-power-of-words/?lang=en`).flush({
      slug: 'the-power-of-words',
      title: 'The Power of Words',
      excerpt: 'An exploration.',
      body,
      published_at: '2026-05-22T00:00:00Z',
      cover_image: null,
      author: { name: 'Alexandra Pintea', slug: 'alexandra-pintea' },
      category: { slug: 'essay', name: 'Essay' },
      available_languages: ['en', 'ro'],
    });
  }

  it('renders the post once it is loaded', async () => {
    flushPost('<p>Words shape worlds.</p>');
    await fixture.whenStable();

    expect(text()).toContain('The Power of Words');
    expect(text()).toContain('Essay');
    // Structural, not just textual: the body is markup now, so a real <p>
    // element is the thing under test. textContent alone would pass just as
    // happily if the tags were being escaped onto the page.
    const paragraph = (fixture.nativeElement as HTMLElement).querySelector('.body p');
    expect(paragraph?.textContent).toContain('Words shape worlds.');
  });

  it('renders the author’s markup, and still sanitizes it', async () => {
    // The two layers, asserted together. Django cleans this on save, so what
    // arrives here is already safe — but the binding is sanitized again on
    // every render, and that second layer is what still stands if a row was
    // written before the sanitizer existed, or by raw SQL.
    flushPost('<div class="center">10</div><script>alert(1)</script><p>after</p>');
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.body .center')?.textContent).toBe('10');
    expect(compiled.querySelector('.body script')).toBeNull();
    expect(text()).not.toContain('alert(1)');
  });

  it('shows the fallback when the post exists but not in this language', async () => {
    TestBed.inject(Store).dispatch(new LoadPostDetail('the-power-of-words', 'en'));
    http
      .expectOne(`${environment.API_BASE_URL}/posts/the-power-of-words/?lang=en`)
      .flush(
        { detail: '...', available_languages: ['ro'] },
        { status: 404, statusText: 'Not Found' },
      );
    await fixture.whenStable();

    // Names the language it does exist in, so the reader has somewhere to go.
    expect(text()).toContain('only available in Romanian');
    expect(text()).not.toContain('Not found.');
  });

  it('shows plain not-found when the post is not on this site at all', async () => {
    TestBed.inject(Store).dispatch(new LoadPostDetail('the-power-of-words', 'en'));
    http
      .expectOne(`${environment.API_BASE_URL}/posts/the-power-of-words/?lang=en`)
      .flush(
        { detail: 'No Post matches the given query.' },
        { status: 404, statusText: 'Not Found' },
      );
    await fixture.whenStable();

    // A plain failure is deliberately not cached — unlike a known language gap
    // — so the component's language effect asks once more. Drain it.
    http
      .match(`${environment.API_BASE_URL}/posts/the-power-of-words/?lang=en`)
      .forEach((request) =>
        request.flush({ detail: '...' }, { status: 404, statusText: 'Not Found' }),
      );

    // No language switch could fix this one, so it must not offer one.
    expect(text()).toContain('Not found.');
    expect(text()).not.toContain('only available in');
  });
});
