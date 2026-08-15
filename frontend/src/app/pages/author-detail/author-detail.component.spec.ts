import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideStore } from '@ngxs/store';

import { ContentState } from '../../stores/content/content.state';
import { LanguageStore } from '../../stores/language.store';
import { SiteConfigStore } from '../../stores/site-config.store';
import { AuthorDetailComponent } from './author-detail.component';

/**
 * Placeholder coverage: the component compiles and every dependency it injects
 * resolves. Deliberately no change detection — the constructor effects dispatch
 * a load, and the testing backend leaves that request outstanding, so
 * whenStable() would wait on a promise nothing ever settles.
 */
describe('AuthorDetailComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTranslateService({ fallbackLang: 'en', lang: 'en' }),
        provideStore([ContentState]),
        SiteConfigStore,
        LanguageStore,
      ],
    });
  });

  it('creates', () => {
    const fixture = TestBed.createComponent(AuthorDetailComponent);
    fixture.componentRef.setInput('slug', 'alexandra-pintea');

    expect(fixture.componentInstance).toBeTruthy();
  });
});
