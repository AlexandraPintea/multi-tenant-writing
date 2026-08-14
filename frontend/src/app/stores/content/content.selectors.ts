import { createSelector } from '@ngxs/store';

import { Author, Page, Post } from './content.models';
import { ContentState, ContentStateModel } from './content.state';

/**
 * Selectors are language-parameterised because every cached collection is
 * nested by language. Each returns a plain function of state, so components
 * can read them through store.selectSignal(...) and stay signal-based like the
 * rest of the app.
 */

export const selectPostList = (lang: string) =>
  createSelector([ContentState], (state: ContentStateModel): Post[] =>
    (state.postListByLang[lang] ?? []).map((slug) => state.postsByLang[lang][slug]),
  );

export const selectPostBySlug = (slug: string, lang: string) =>
  createSelector(
    [ContentState],
    (state: ContentStateModel): Post | null => state.postsByLang[lang]?.[slug] ?? null,
  );

/**
 * Languages a post actually exists in — learned either from a successful
 * response or from the 404 body. Empty until one of those has happened, which
 * the toggle must treat as "unknown", not as "no translations".
 */
export const selectAvailableLanguages = (slug: string) =>
  createSelector(
    [ContentState],
    (state: ContentStateModel): string[] => state.availableLanguages[slug] ?? [],
  );

/** True when the post exists on this site but not in the requested language. */
export const selectIsNotInLanguage = (slug: string, lang: string) =>
  createSelector([ContentState], (state: ContentStateModel): boolean => {
    const available = state.availableLanguages[slug];
    return Boolean(available?.length) && !available.includes(lang);
  });

export const selectAuthorList = (lang: string) =>
  createSelector([ContentState], (state: ContentStateModel): Author[] =>
    Object.values(state.authorsByLang[lang] ?? {}),
  );

export const selectAuthorBySlug = (slug: string, lang: string) =>
  createSelector(
    [ContentState],
    (state: ContentStateModel): Author | null => state.authorsByLang[lang]?.[slug] ?? null,
  );

export const selectPageBySlug = (slug: string, lang: string) =>
  createSelector(
    [ContentState],
    (state: ContentStateModel): Page | null => state.pagesByLang[lang]?.[slug] ?? null,
  );

export const selectContentLoading = createSelector(
  [ContentState],
  (state: ContentStateModel): boolean => state.loading,
);

export const selectContentError = createSelector(
  [ContentState],
  (state: ContentStateModel): string | null => state.error,
);
