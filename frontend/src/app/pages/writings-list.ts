import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Store } from '@ngxs/store';

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

  protected readonly posts = computed(() => postListOf(this.content(), this.language()));
}
