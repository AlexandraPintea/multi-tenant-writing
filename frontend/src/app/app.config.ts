import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { provideStore } from '@ngxs/store';
import { withNgxsReduxDevtoolsPlugin } from '@ngxs/devtools-plugin';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { ContentState } from './stores/content/content.state';
import { LanguageStore } from './stores/language.store';
import { SiteConfigStore } from './stores/site-config.store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    SiteConfigStore,
    LanguageStore,
    // Content is the one slice with real side effects — HTTP, error handling
    // and cache invalidation on language change — so it gets the explicit
    // action/handler/selector treatment rather than another SignalStore.
    provideStore([ContentState], withNgxsReduxDevtoolsPlugin({ disabled: environment.production })),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withFetch()),
    provideTranslateService({
      fallbackLang: 'en',
      lang: 'en',
    }),
    provideTranslateHttpLoader({
      prefix: '/i18n/',
      suffix: '.json',
    }),
  ],
};
