import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Action, State, StateContext } from '@ngxs/store';
import { catchError, EMPTY, Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ClearContent,
  LoadAuthorDetail,
  LoadAuthorList,
  LoadPage,
  LoadPostDetail,
  LoadPostDetailFailure,
  LoadPostDetailNotInLanguage,
  LoadPostDetailSuccess,
  LoadPostList,
  LoadPostListFailure,
  LoadPostListSuccess,
} from './content.actions';
import { Author, Page, Paginated, Post } from './content.models';

export interface ContentStateModel {
  /**
   * lang -> slug -> post.
   *
   * Nested by language rather than a flat slug key, because the same slug
   * carries different title/body/excerpt per language. A flat map would have
   * each language switch overwrite the other's copy, and the "already cached"
   * guard below would then hand back the wrong text.
   */
  postsByLang: Record<string, Record<string, Post>>;
  /** lang -> ordered slugs, preserving the API's published_at desc ordering. */
  postListByLang: Record<string, string[]>;
  /** Languages whose *list* has been fetched, so a revisit does not refetch. */
  loadedListLangs: string[];
  /** slug -> languages whose *detail* (with body) has been fetched. */
  loadedDetailLangs: Record<string, string[]>;
  /** slug -> languages the post does exist in, learned from a 404 body. */
  availableLanguages: Record<string, string[]>;
  authorsByLang: Record<string, Record<string, Author>>;
  pagesByLang: Record<string, Record<string, Page>>;
  loading: boolean;
  error: string | null;
}

const defaults: ContentStateModel = {
  postsByLang: {},
  postListByLang: {},
  loadedListLangs: [],
  loadedDetailLangs: {},
  availableLanguages: {},
  authorsByLang: {},
  pagesByLang: {},
  loading: false,
  error: null,
};

@State<ContentStateModel>({ name: 'content', defaults })
@Injectable()
export class ContentState {
  private readonly http = inject(HttpClient);

  @Action(LoadPostList)
  loadPostList(
    ctx: StateContext<ContentStateModel>,
    { lang }: LoadPostList,
  ): Observable<unknown> | void {
    if (ctx.getState().loadedListLangs.includes(lang)) {
      // Already cached for this language: navigating back to the archive must
      // not re-hit the API.
      return;
    }

    ctx.patchState({ loading: true, error: null });
    return this.http
      .get<Paginated<Post>>(`${environment.API_BASE_URL}/posts/`, {
        params: { lang },
      })
      .pipe(
        tap((response) => {
          const state = ctx.getState();
          ctx.patchState({
            postsByLang: {
              ...state.postsByLang,
              [lang]: {
                ...state.postsByLang[lang],
                ...Object.fromEntries(response.results.map((post) => [post.slug, post])),
              },
            },
            postListByLang: {
              ...state.postListByLang,
              [lang]: response.results.map((post) => post.slug),
            },
            loadedListLangs: [...state.loadedListLangs, lang],
            loading: false,
          });
          ctx.dispatch(
            new LoadPostListSuccess(
              lang,
              response.results.map((post) => post.slug),
            ),
          );
        }),
        catchError((error: HttpErrorResponse) => {
          ctx.patchState({ loading: false, error: error.message });
          ctx.dispatch(new LoadPostListFailure(error.message));
          return EMPTY;
        }),
      );
  }

  @Action(LoadPostDetail)
  loadPostDetail(
    ctx: StateContext<ContentStateModel>,
    { slug, lang }: LoadPostDetail,
  ): Observable<unknown> | void {
    const state = ctx.getState();
    if (state.loadedDetailLangs[slug]?.includes(lang)) {
      return;
    }
    if (state.availableLanguages[slug]?.length && !state.availableLanguages[slug].includes(lang)) {
      // Already learned this post has no such translation — do not ask again.
      return;
    }

    ctx.patchState({ loading: true, error: null });
    return this.http
      .get<Post>(`${environment.API_BASE_URL}/posts/${slug}/`, {
        params: { lang },
      })
      .pipe(
        tap((post) => {
          const current = ctx.getState();
          ctx.patchState({
            postsByLang: {
              ...current.postsByLang,
              [lang]: { ...current.postsByLang[lang], [slug]: post },
            },
            loadedDetailLangs: {
              ...current.loadedDetailLangs,
              [slug]: [...(current.loadedDetailLangs[slug] ?? []), lang],
            },
            availableLanguages: {
              ...current.availableLanguages,
              [slug]: post.available_languages,
            },
            loading: false,
          });
          ctx.dispatch(new LoadPostDetailSuccess(slug, lang));
        }),
        catchError((error: HttpErrorResponse) => {
          const available = error.error?.available_languages;
          if (error.status === 404 && Array.isArray(available)) {
            // Not a failure: the post exists here, just not in this language.
            const current = ctx.getState();
            ctx.patchState({
              availableLanguages: {
                ...current.availableLanguages,
                [slug]: available,
              },
              loading: false,
            });
            ctx.dispatch(new LoadPostDetailNotInLanguage(slug, lang, available));
            return EMPTY;
          }
          ctx.patchState({ loading: false, error: error.message });
          ctx.dispatch(new LoadPostDetailFailure(slug, error.message));
          return EMPTY;
        }),
      );
  }

  @Action(LoadAuthorList)
  loadAuthorList(
    ctx: StateContext<ContentStateModel>,
    { lang }: LoadAuthorList,
  ): Observable<unknown> {
    ctx.patchState({ loading: true, error: null });
    return this.http
      .get<Paginated<Author>>(`${environment.API_BASE_URL}/authors/`, {
        params: { lang },
      })
      .pipe(
        tap((response) => {
          const state = ctx.getState();
          ctx.patchState({
            authorsByLang: {
              ...state.authorsByLang,
              [lang]: {
                ...state.authorsByLang[lang],
                ...Object.fromEntries(response.results.map((author) => [author.slug, author])),
              },
            },
            loading: false,
          });
        }),
        catchError((error: HttpErrorResponse) => {
          ctx.patchState({ loading: false, error: error.message });
          return EMPTY;
        }),
      );
  }

  @Action(LoadAuthorDetail)
  loadAuthorDetail(
    ctx: StateContext<ContentStateModel>,
    { slug, lang }: LoadAuthorDetail,
  ): Observable<unknown> {
    ctx.patchState({ loading: true, error: null });
    return this.http
      .get<Author>(`${environment.API_BASE_URL}/authors/${slug}/`, {
        params: { lang },
      })
      .pipe(
        tap((author) => {
          const state = ctx.getState();
          ctx.patchState({
            authorsByLang: {
              ...state.authorsByLang,
              [lang]: { ...state.authorsByLang[lang], [slug]: author },
            },
            loading: false,
          });
        }),
        catchError((error: HttpErrorResponse) => {
          ctx.patchState({ loading: false, error: error.message });
          return EMPTY;
        }),
      );
  }

  @Action(LoadPage)
  loadPage(
    ctx: StateContext<ContentStateModel>,
    { slug, lang }: LoadPage,
  ): Observable<unknown> | void {
    if (ctx.getState().pagesByLang[lang]?.[slug]) {
      return;
    }

    ctx.patchState({ loading: true, error: null });
    return this.http
      .get<Page>(`${environment.API_BASE_URL}/pages/${slug}/`, {
        params: { lang },
      })
      .pipe(
        tap((page) => {
          const state = ctx.getState();
          ctx.patchState({
            pagesByLang: {
              ...state.pagesByLang,
              [lang]: { ...state.pagesByLang[lang], [slug]: page },
            },
            loading: false,
          });
        }),
        catchError((error: HttpErrorResponse) => {
          ctx.patchState({ loading: false, error: error.message });
          return EMPTY;
        }),
      );
  }

  @Action(ClearContent)
  clearContent(ctx: StateContext<ContentStateModel>): void {
    ctx.setState({ ...defaults });
  }
}
