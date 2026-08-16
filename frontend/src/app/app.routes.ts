import { Routes } from '@angular/router';

import {
  authorDetailResolver,
  authorListResolver,
  pageResolver,
  postDetailResolver,
  postListResolver,
} from './routes/content.resolvers';
// authorListResolver still runs for /authors; it lost its second caller when the
// home route went away.

/**
 * Every route is lazy-loaded via loadComponent, so a reader who lands on a post
 * never downloads the author-grid layout, and each site pays only for the
 * screens it actually shows.
 *
 * There is no per-site route table: both tenants share this tree.
 *
 * The root redirects to /writings rather than rendering a home screen, which
 * leaves SiteHomeComponent and the two layouts it switches between unreachable.
 * That is a departure from architecture §5.1/§5.2, where the home route picks
 * its layout from the API's `layout` key — so Roam's author grid, which was
 * only ever reachable from `/`, is currently not reachable at all.
 *
 * Resolvers return the dispatch observable so the router waits for it. That is
 * what makes SSR emit finished HTML instead of an empty shell, which is the
 * entire justification for server rendering here.
 */
export const routes: Routes = [
  // The archive is the landing page: there is no separate home screen, so the
  // root redirects rather than rendering anything of its own. Language is not
  // in the URL — LanguageStore resolves it per reader — so /writings is the
  // English archive for a reader who has expressed no preference.
  { path: '', pathMatch: 'full', redirectTo: '/writings' },
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
    // Its own component, not StaticPageComponent: this page has a form and an
    // HTTP call, where /about only renders admin-written prose. No resolver
    // either — there is nothing to fetch before rendering it.
    path: 'contact',
    loadComponent: () =>
      import('./pages/contact-page/contact-page.component').then((m) => m.ContactPageComponent),
  },
  { path: '**', redirectTo: '/writings' },
];
