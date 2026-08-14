/**
 * NGXS actions for the content slice.
 *
 * Classes rather than createAction factories: NGXS dispatches instances and
 * matches handlers on the class, and the static `type` is what shows up in the
 * Redux DevTools timeline.
 */

export class LoadPostList {
  static readonly type = '[Content] Load post list';
  constructor(readonly lang: string) {}
}

export class LoadPostListSuccess {
  static readonly type = '[Content] Load post list success';
  constructor(
    readonly lang: string,
    readonly slugs: string[],
  ) {}
}

export class LoadPostListFailure {
  static readonly type = '[Content] Load post list failure';
  constructor(readonly message: string) {}
}

export class LoadPostDetail {
  static readonly type = '[Content] Load post detail';
  constructor(
    readonly slug: string,
    readonly lang: string,
  ) {}
}

export class LoadPostDetailSuccess {
  static readonly type = '[Content] Load post detail success';
  constructor(
    readonly slug: string,
    readonly lang: string,
  ) {}
}

/**
 * The post exists on this site but not in this language.
 *
 * Deliberately its own action rather than a failure: the API answers with a
 * 404 carrying `available_languages`, and the UI turns that into "this piece is
 * only available in English" with a link. Folding it into LoadPostDetailFailure
 * would throw away the one piece of information that makes the page useful.
 */
export class LoadPostDetailNotInLanguage {
  static readonly type = '[Content] Post not available in language';
  constructor(
    readonly slug: string,
    readonly lang: string,
    readonly availableLanguages: string[],
  ) {}
}

export class LoadPostDetailFailure {
  static readonly type = '[Content] Load post detail failure';
  constructor(
    readonly slug: string,
    readonly message: string,
  ) {}
}

export class LoadAuthorList {
  static readonly type = '[Content] Load author list';
  constructor(readonly lang: string) {}
}

export class LoadAuthorDetail {
  static readonly type = '[Content] Load author detail';
  constructor(
    readonly slug: string,
    readonly lang: string,
  ) {}
}

export class LoadPage {
  static readonly type = '[Content] Load page';
  constructor(
    readonly slug: string,
    readonly lang: string,
  ) {}
}

/** Drops every cached response. Dispatch when the tenant changes. */
export class ClearContent {
  static readonly type = '[Content] Clear';
}
