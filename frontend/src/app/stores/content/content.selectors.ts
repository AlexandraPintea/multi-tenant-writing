import { createSelector } from '@ngxs/store';

import { Author, Page, Post } from './content.models';
import { ContentState, ContentStateModel } from './content.state';

/**
 * Each selector exists twice on purpose.
 *
 * The pure `fooOf(state, ...)` function is what components use, via a single
 * `store.selectSignal(ContentState)` signal fed into a computed. Calling
 * `selectSignal(selectFoo(lang))` inside a computed would instead build a brand
 * new signal on every recomputation, which leaks and defeats memoisation.
 *
 * The `selectFoo(...)` wrapper is the NGXS-shaped version for
 * `store.select`/`selectSnapshot` and for tests.
 *
 * Everything is language-parameterised because the cache is nested by language
 * — see the note on ContentStateModel.postsByLang.
 */

export const postListOf = (state: ContentStateModel, lang: string): Post[] =>
  (state.postListByLang[lang] ?? []).map((slug) => state.postsByLang[lang][slug]);

export const postOf = (state: ContentStateModel, slug: string, lang: string): Post | null =>
  state.postsByLang[lang]?.[slug] ?? null;

/**
 * Languages a post actually exists in — learned from a successful response or
 * from a 404 body. Empty means "not known yet", which the toggle must treat as
 * unknown rather than as "no translations".
 */
export const availableLanguagesOf = (state: ContentStateModel, slug: string): string[] =>
  state.availableLanguages[slug] ?? [];

/** True when the post exists on this site but not in the requested language. */
export const isNotInLanguageOf = (
  state: ContentStateModel,
  slug: string,
  lang: string,
): boolean => {
  const available = state.availableLanguages[slug];
  return Boolean(available?.length) && !available.includes(lang);
};

export const authorListOf = (state: ContentStateModel, lang: string): Author[] =>
  Object.values(state.authorsByLang[lang] ?? {});

export const authorOf = (state: ContentStateModel, slug: string, lang: string): Author | null =>
  state.authorsByLang[lang]?.[slug] ?? null;

export const pageOf = (state: ContentStateModel, slug: string, lang: string): Page | null =>
  state.pagesByLang[lang]?.[slug] ?? null;

// ------------------------------------------------------------ NGXS selectors

/**
 * The whole slice as one signal. Components take this once and derive with the
 * pure helpers above, which keeps the language parameter out of the selector
 * identity — `selectSignal` needs a stable selector, and a parameterised one
 * would be a new object on every language change.
 */
export const selectContentSlice = createSelector(
  [ContentState],
  (state: ContentStateModel): ContentStateModel => state,
);

export const selectPostList = (lang: string) =>
  createSelector([ContentState], (state: ContentStateModel) => postListOf(state, lang));

export const selectPostBySlug = (slug: string, lang: string) =>
  createSelector([ContentState], (state: ContentStateModel) => postOf(state, slug, lang));

export const selectAvailableLanguages = (slug: string) =>
  createSelector([ContentState], (state: ContentStateModel) => availableLanguagesOf(state, slug));

export const selectIsNotInLanguage = (slug: string, lang: string) =>
  createSelector([ContentState], (state: ContentStateModel) =>
    isNotInLanguageOf(state, slug, lang),
  );

export const selectAuthorList = (lang: string) =>
  createSelector([ContentState], (state: ContentStateModel) => authorListOf(state, lang));

export const selectAuthorBySlug = (slug: string, lang: string) =>
  createSelector([ContentState], (state: ContentStateModel) => authorOf(state, slug, lang));

export const selectPageBySlug = (slug: string, lang: string) =>
  createSelector([ContentState], (state: ContentStateModel) => pageOf(state, slug, lang));

export const selectContentLoading = createSelector(
  [ContentState],
  (state: ContentStateModel): boolean => state.loading,
);

export const selectContentError = createSelector(
  [ContentState],
  (state: ContentStateModel): string | null => state.error,
);
