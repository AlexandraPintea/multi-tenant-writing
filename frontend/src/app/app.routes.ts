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
    loadComponent: () => import('./layouts/site-home').then((m) => m.SiteHome),
  },
  {
    path: 'writings',
    resolve: { posts: postListResolver },
    loadComponent: () => import('./pages/writings-list').then((m) => m.WritingsList),
  },
  {
    path: 'writings/:slug',
    resolve: { post: postDetailResolver },
    loadComponent: () => import('./pages/post-detail').then((m) => m.PostDetail),
  },
  {
    path: 'authors',
    resolve: { authors: authorListResolver },
    loadComponent: () => import('./pages/authors-list').then((m) => m.AuthorsList),
  },
  {
    path: 'authors/:slug',
    resolve: { author: authorDetailResolver },
    loadComponent: () => import('./pages/author-detail').then((m) => m.AuthorDetail),
  },
  {
    path: 'about',
    data: { pageSlug: 'about' },
    resolve: { page: pageResolver },
    loadComponent: () => import('./pages/static-page').then((m) => m.StaticPage),
  },
  {
    path: 'contact',
    data: { pageSlug: 'contact' },
    resolve: { page: pageResolver },
    loadComponent: () => import('./pages/static-page').then((m) => m.StaticPage),
  },
  { path: '**', redirectTo: '' },
];
