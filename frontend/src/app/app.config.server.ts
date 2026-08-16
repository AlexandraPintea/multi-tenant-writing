import { FetchBackend, HttpBackend } from '@angular/common/http';
import { inject, mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { TranslateLoader } from '@ngx-translate/core';

import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { InternalApiBackend, resolveInternalApiOrigin } from './core/internal-api';
import { ServerTranslateLoader } from './i18n/server-translate.loader';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Overrides the HTTP loader from appConfig — see ServerTranslateLoader for
    // why a relative /i18n/ URL is actively wrong on the server.
    { provide: TranslateLoader, useClass: ServerTranslateLoader },
    // API calls go straight to Django over the container network instead of
    // back out through nginx. Wrapping the backend rather than replacing it
    // keeps fetch, and keeps the rewrite after every interceptor — see
    // internal-api.ts on why that ordering is the whole point.
    {
      provide: HttpBackend,
      useFactory: () => new InternalApiBackend(inject(FetchBackend), resolveInternalApiOrigin()),
    },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
