import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Actions, ofActionDispatched, provideStore, Store } from '@ngxs/store';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  LoadPage,
  LoadPostDetail,
  LoadPostDetailFailure,
  LoadPostDetailNotInLanguage,
  LoadPostList,
} from './content.actions';
import { Post } from './content.models';
import {
  selectAvailableLanguages,
  selectIsNotInLanguage,
  selectPostBySlug,
  selectPostList,
} from './content.selectors';
import { ContentState } from './content.state';

const API = environment.API_BASE_URL;

function post(slug: string, title: string, languages = ['en']): Post {
  return {
    slug,
    title,
    excerpt: '',
    published_at: '2026-05-22T00:00:00Z',
    cover_image: null,
    author: { name: 'Alexandra Pintea', slug: 'alexandra-pintea' },
    category: { slug: 'essay', name: 'Essay' },
    available_languages: languages,
  };
}

describe('ContentState', () => {
  let store: Store;
  let http: HttpTestingController;
  let actions$: Actions;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideStore([ContentState])],
    });
    store = TestBed.inject(Store);
    http = TestBed.inject(HttpTestingController);
    actions$ = TestBed.inject(Actions);
  });

  afterEach(() => http.verify());

  it('populates the list keyed by slug, preserving API order', () => {
    store.dispatch(new LoadPostList('en'));
    http.expectOne(`${API}/posts/?lang=en`).flush({
      count: 2,
      next: null,
      previous: null,
      results: [post('second', 'Second'), post('first', 'First')],
    });

    const listed = store.selectSnapshot(selectPostList('en'));
    expect(listed.map((p) => p.slug)).toEqual(['second', 'first']);
    expect(store.selectSnapshot(selectPostBySlug('first', 'en'))?.title).toBe('First');
  });

  it('does not refetch a list it already has for that language', () => {
    store.dispatch(new LoadPostList('en'));
    http.expectOne(`${API}/posts/?lang=en`).flush({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    store.dispatch(new LoadPostList('en'));
    http.expectNone(`${API}/posts/?lang=en`);
  });

  it('does fetch a different language, since the cached copy is other text', () => {
    store.dispatch(new LoadPostList('en'));
    http.expectOne(`${API}/posts/?lang=en`).flush({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    store.dispatch(new LoadPostList('ro'));
    http.expectOne(`${API}/posts/?lang=ro`).flush({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
  });

  it('keeps each language separate rather than overwriting by slug', () => {
    store.dispatch(new LoadPostList('en'));
    http.expectOne(`${API}/posts/?lang=en`).flush({
      count: 1,
      next: null,
      previous: null,
      results: [post('the-power-of-words', 'The Power of Words', ['en', 'ro'])],
    });
    store.dispatch(new LoadPostList('ro'));
    http.expectOne(`${API}/posts/?lang=ro`).flush({
      count: 1,
      next: null,
      previous: null,
      results: [post('the-power-of-words', 'Puterea Cuvintelor', ['en', 'ro'])],
    });

    expect(store.selectSnapshot(selectPostBySlug('the-power-of-words', 'en'))?.title).toBe(
      'The Power of Words',
    );
    expect(store.selectSnapshot(selectPostBySlug('the-power-of-words', 'ro'))?.title).toBe(
      'Puterea Cuvintelor',
    );
  });

  it('dispatches LoadPostDetailNotInLanguage on a 404 that carries the hint', async () => {
    const dispatched = firstValueFrom(
      actions$.pipe(ofActionDispatched(LoadPostDetailNotInLanguage)),
    );

    store.dispatch(new LoadPostDetail('writing-in-the-margins', 'ro'));
    http.expectOne(`${API}/posts/writing-in-the-margins/?lang=ro`).flush(
      {
        detail: 'This post is not available in the requested language.',
        available_languages: ['en'],
      },
      { status: 404, statusText: 'Not Found' },
    );

    const action = await dispatched;
    expect(action.availableLanguages).toEqual(['en']);
    expect(store.selectSnapshot(selectAvailableLanguages('writing-in-the-margins'))).toEqual([
      'en',
    ]);
    expect(store.selectSnapshot(selectIsNotInLanguage('writing-in-the-margins', 'ro'))).toBe(true);
  });

  it('treats a 404 without the hint as a genuine failure', async () => {
    const dispatched = firstValueFrom(actions$.pipe(ofActionDispatched(LoadPostDetailFailure)));

    store.dispatch(new LoadPostDetail('not-published-here', 'en'));
    http
      .expectOne(`${API}/posts/not-published-here/?lang=en`)
      .flush(
        { detail: 'No Post matches the given query.' },
        { status: 404, statusText: 'Not Found' },
      );

    await expect(dispatched).resolves.toBeTruthy();
    expect(store.selectSnapshot(selectAvailableLanguages('not-published-here'))).toEqual([]);
  });

  it('does not re-request a language it already knows the post lacks', () => {
    store.dispatch(new LoadPostDetail('writing-in-the-margins', 'ro'));
    http
      .expectOne(`${API}/posts/writing-in-the-margins/?lang=ro`)
      .flush(
        { detail: '...', available_languages: ['en'] },
        { status: 404, statusText: 'Not Found' },
      );

    store.dispatch(new LoadPostDetail('writing-in-the-margins', 'ro'));
    http.expectNone(`${API}/posts/writing-in-the-margins/?lang=ro`);
  });

  it('caches page detail per language', () => {
    store.dispatch(new LoadPage('about', 'en'));
    http
      .expectOne(`${API}/pages/about/?lang=en`)
      .flush({ slug: 'about', title: 'About', content: 'Essays.' });

    store.dispatch(new LoadPage('about', 'en'));
    http.expectNone(`${API}/pages/about/?lang=en`);

    store.dispatch(new LoadPage('about', 'ro'));
    http
      .expectOne(`${API}/pages/about/?lang=ro`)
      .flush({ slug: 'about', title: 'Despre', content: 'Eseuri.' });
  });
});
