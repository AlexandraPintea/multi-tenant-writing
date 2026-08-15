import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Store } from '@ngxs/store';

import { SeoService } from '../../core/seo';
import { LoadPostList } from '../../stores/content/content.actions';
import { postListOf, selectContentSlice } from '../../stores/content/content.selectors';
import { LanguageStore } from '../../stores/language.store';

/**
 * The full archive. Same preview shape as the homepage block, and no category
 * tabs — categories are small labels in v1 (requirements §3.4).
 *
 * Switching language re-filters the list rather than translating it in place:
 * the API only returns posts that exist in the active language, so an
 * English-only piece simply leaves the Romanian archive.
 */
@Component({
  selector: 'app-writings-list',
  imports: [RouterLink, TranslatePipe, DatePipe],
  templateUrl: './writings-list.component.html',
  styleUrl: './writings-list.component.scss',
})
export class WritingsListComponent {
  private readonly store = inject(Store);
  private readonly content = this.store.selectSignal(selectContentSlice);
  private readonly language = inject(LanguageStore).language;
  private readonly translate = inject(TranslateService);
  private readonly seo = inject(SeoService);

  protected readonly posts = computed(() => postListOf(this.content(), this.language()));

  /**
   * stream(), not instant().
   *
   * instant() returns the fallback when the target language file has not
   * finished loading, and switching language starts an async load — so the
   * Romanian archive rendered `<title>Writings</title>`. stream() re-emits both
   * on language change and once the file arrives.
   */
  private readonly seoTitle = toSignal(this.translate.stream('writings.title'), {
    initialValue: '',
  });
  private readonly seoDescription = toSignal(this.translate.stream('writings.description'), {
    initialValue: '',
  });

  constructor() {
    // Route resolvers only run on navigation, so switching language while
    // standing on this page would leave the old archive on screen. The store's
    // cache guard makes the repeat dispatch free when nothing changed.
    effect(() => {
      this.store.dispatch(new LoadPostList(this.language()));
    });

    effect(() => {
      const title = this.seoTitle();
      if (!title) {
        return;
      }
      this.seo.apply({
        title,
        description: this.seoDescription(),
        path: '/writings',
      });
    });
  }
}
