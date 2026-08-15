import { Routes } from '@angular/router';

import {
  authorDetailResolver,
  authorListResolver,
  pageResolver,
  postDetailResolver,
  postListResolver,
} from './routes/content.resolvers';

/**
 * Every route is lazy-loaded via loadComponent, so a reader who lands on a post
 * never downloads the author-grid layout, and each site pays only for the
 * screens it actually shows.
 *
 * There is no per-site route table. Both tenants share this tree and the home
 * route picks its layout from the API's `layout` key — adding a third site is a
 * database row, not a build target (architecture §5.1).
 *
 * Resolvers return the dispatch observable so the router waits for it. That is
 * what makes SSR emit finished HTML instead of an empty shell, which is the
 * entire justification for server rendering here.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    // The home screen needs both collections: the editorial layout lists recent
    // posts, the grid layout lists authors, and which one renders is not known
    // until site-config arrives.
    resolve: { posts: postListResolver, authors: authorListResolver },
    loadComponent: () =>
      import('./layouts/site-home/site-home.component').then((m) => m.SiteHomeComponent),
  },
  {
    path: 'writings',
    resolve: { posts: postListResolver },
    loadComponent: () =>
      import('./pages/writings-list/writings-list.component').then((m) => m.WritingsListComponent),
  },
  {
    path: 'writings/:slug',
    resolve: { post: postDetailResolver },
    loadComponent: () =>
      import('./pages/post-detail/post-detail.component').then((m) => m.PostDetailComponent),
  },
  {
    path: 'authors',
    resolve: { authors: authorListResolver },
    loadComponent: () =>
      import('./pages/authors-list/authors-list.component').then((m) => m.AuthorsListComponent),
  },
  {
    path: 'authors/:slug',
    resolve: { author: authorDetailResolver },
    loadComponent: () =>
      import('./pages/author-detail/author-detail.component').then((m) => m.AuthorDetailComponent),
  },
  {
    path: 'about',
    data: { pageSlug: 'about' },
    resolve: { page: pageResolver },
    loadComponent: () =>
      import('./pages/static-page/static-page.component').then((m) => m.StaticPageComponent),
  },
  {
    path: 'contact',
    data: { pageSlug: 'contact' },
    resolve: { page: pageResolver },
    loadComponent: () =>
      import('./pages/static-page/static-page.component').then((m) => m.StaticPageComponent),
  },
  { path: '**', redirectTo: '' },
];
