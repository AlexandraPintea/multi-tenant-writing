import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { TranslateLoader } from '@ngx-translate/core';

import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { ServerTranslateLoader } from './i18n/server-translate.loader';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Overrides the HTTP loader from appConfig — see ServerTranslateLoader for
    // why a relative /i18n/ URL is actively wrong on the server.
    { provide: TranslateLoader, useClass: ServerTranslateLoader },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
