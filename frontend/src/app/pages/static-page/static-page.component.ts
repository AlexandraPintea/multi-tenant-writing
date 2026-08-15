import { Component, computed, effect, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Store } from '@ngxs/store';

import { SeoService } from '../../core/seo';
import { LoadPage } from '../../stores/content/content.actions';
import { pageOf, selectContentSlice } from '../../stores/content/content.selectors';
import { LanguageStore } from '../../stores/language.store';

/**
 * About and Contact. One component for both: they differ only by the slug the
 * route supplies, and their content is admin-editable per site (§3.1), so
 * hard-coding either would put copy in the bundle instead of the database.
 */
@Component({
  selector: 'app-static-page',
  imports: [TranslatePipe],
  templateUrl: './static-page.component.html',
  styleUrl: './static-page.component.scss',
})
export class StaticPageComponent {
  /** From route data, not the URL — /about and /contact are fixed paths. */
  readonly pageSlug = input.required<string>();

  private readonly store = inject(Store);
  private readonly content = this.store.selectSignal(selectContentSlice);
  private readonly language = inject(LanguageStore).language;
  private readonly seo = inject(SeoService);

  protected readonly page = computed(() =>
    pageOf(this.content(), this.pageSlug(), this.language()),
  );

  constructor() {
    // Language switches must re-fetch; the resolver only ran on navigation.
    effect(() => {
      this.store.dispatch(new LoadPage(this.pageSlug(), this.language()));
    });

    effect(() => {
      const page = this.page();
      if (!page) {
        return;
      }
      this.seo.apply({
        title: page.title,
        // First couple of lines of the body: these pages have no excerpt field.
        description: page.content.slice(0, 200),
        path: `/${page.slug}`,
      });
    });
  }
}
