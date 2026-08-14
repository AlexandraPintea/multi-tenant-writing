import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    // Server, not Prerender. Prerendering renders each route once at build
    // time, which cannot work here: the same bundle serves alexandrapintea.eu
    // and roamliterary.com, and which content, theme and languages apply is
    // decided per request from the Host header. A build-time render has no
    // Host, no API to call, and could only ever bake in one tenant — the
    // scaffold's default failed the build outright on /api/site-config/.
    renderMode: RenderMode.Server,
  },
];
