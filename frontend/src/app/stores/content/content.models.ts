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
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
