import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Store } from '@ngxs/store';

import { SeoService } from '../core/seo';
import { postListOf, selectContentSlice } from '../stores/content/content.selectors';
import { LanguageStore } from '../stores/language.store';

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
  template: `
    <h1>{{ 'writings.title' | translate }}</h1>

    @for (post of posts(); track post.slug) {
      <article class="preview">
        <p class="preview__meta">
          @if (post.category) {
            <span class="preview__category">{{ post.category.name }}</span>
          }
          <time [attr.datetime]="post.published_at">
            {{ post.published_at | date: 'longDate' }}
          </time>
          @if (post.author) {
            <span>{{ post.author.name }}</span>
          }
        </p>
        <h2>
          <a [routerLink]="['/writings', post.slug]">{{ post.title }}</a>
        </h2>
        <p>{{ post.excerpt }}</p>
      </article>
    } @empty {
      <p>{{ 'common.nothingYet' | translate }}</p>
    }
  `,
  styles: `
    .preview {
      margin-block: 2rem;
      max-width: 42rem;
    }
    .preview__meta {
      display: flex;
      gap: 0.75rem;
      font-size: 0.85rem;
      opacity: 0.7;
    }
    .preview__category {
      color: var(--accent);
    }
    .preview h2 a {
      color: inherit;
      text-decoration: none;
    }
  `,
})
export class WritingsList {
  private readonly content = inject(Store).selectSignal(selectContentSlice);
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
