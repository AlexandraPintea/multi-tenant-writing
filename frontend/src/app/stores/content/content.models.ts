/** Shapes returned by the Django API. Mirrors backend/api/serializers.py. */

export interface AuthorBrief {
  name: string;
  slug: string;
}

export interface CategoryLabel {
  slug: string;
  name: string;
}

export interface Post {
  slug: string;
  title: string;
  excerpt: string;
  published_at: string | null;
  cover_image: string | null;
  /** Null where the writer has no profile on the requesting site. */
  author: AuthorBrief | null;
  /** Null until existing content is categorised; nullable by design. */
  category: CategoryLabel | null;
  /** Languages this specific post exists in, not what the site enables. */
  available_languages: string[];
  /** Detail only — absent on list payloads. */
  body?: string;
  /**
   * The older neighbour in this site's archive for this language, or null on
   * the oldest post. Detail only, and optional so list fixtures still typecheck.
   */
  next_post?: NextPost | null;
  /**
   * Approved comments for this post on this site, oldest first. Detail only.
   * Embedded rather than fetched separately, so the thread is server-rendered
   * with the article.
   */
  comments?: Comment[];
}

/** An approved comment. Never carries anything the moderator sees but a reader should not. */
export interface Comment {
  name: string;
  body: string;
  created_at: string;
}

/** Just enough of a post to link to it. */
export interface NextPost {
  slug: string;
  title: string;
}

export interface Author {
  name: string;
  slug: string;
  location: string;
  social_links: Record<string, string>;
  portrait: string | null;
  bio: string;
  /** Detail only. */
  posts?: Post[];
}

export interface Page {
  slug: string;
  title: string;
  content: string;
  /** Root-relative upload path, or null when the page has no photo. */
  image: string | null;
  /** Never empty when there is an image: the API falls back to the title. */
  image_alt: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
