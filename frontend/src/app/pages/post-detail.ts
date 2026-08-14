import { DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Store } from '@ngxs/store';

import {
  availableLanguagesOf,
  isNotInLanguageOf,
  postOf,
  selectContentSlice,
} from '../stores/content/content.selectors';
import { LanguageStore } from '../stores/language.store';

/**
 * A single piece.
 *
 * Three states, not two: the post rendered, the post absent, and the post
 * present on this site but not in the active language. That third one is the
 * whole reason the API answers with a 404 carrying `available_languages`
 * (architecture §4.3) — it lets this page say "only available in English" and
 * link there, instead of showing a generic not-found.
 */
@Component({
  selector: 'app-post-detail',
  imports: [RouterLink, TranslatePipe, DatePipe],
  template: `
    @if (post(); as loaded) {
      <article>
        <p class="meta">
          @if (loaded.category) {
            <span class="meta__category">{{ loaded.category.name }}</span>
          }
          <time [attr.datetime]="loaded.published_at">
            {{ loaded.published_at | date: 'longDate' }}
          </time>
          @if (loaded.author) {
            <span>{{ loaded.author.name }}</span>
          }
        </p>
        <h1>{{ loaded.title }}</h1>
        <div class="body">{{ loaded.body }}</div>
      </article>
    } @else if (notInLanguage()) {
      <section class="unavailable">
        <p>
          {{ 'post.notInLanguage' | translate: { languages: availableLanguages().join(', ') } }}
        </p>
        <a [routerLink]="['/writings']">{{ 'writings.title' | translate }} →</a>
      </section>
    } @else {
      <p>{{ 'common.notFound' | translate }}</p>
    }
  `,
  styles: `
    article {
      max-width: 42rem;
    }
    .meta {
      display: flex;
      gap: 0.75rem;
      font-size: 0.85rem;
      opacity: 0.7;
    }
    .meta__category {
      color: var(--accent);
    }
    .body {
      white-space: pre-wrap;
      line-height: 1.7;
    }
  `,
})
export class PostDetail {
  /** Bound from the route param via withComponentInputBinding(). */
  readonly slug = input.required<string>();

  private readonly content = inject(Store).selectSignal(selectContentSlice);
  private readonly language = inject(LanguageStore).language;

  protected readonly post = computed(() => postOf(this.content(), this.slug(), this.language()));
  protected readonly notInLanguage = computed(() =>
    isNotInLanguageOf(this.content(), this.slug(), this.language()),
  );
  protected readonly availableLanguages = computed(() =>
    availableLanguagesOf(this.content(), this.slug()),
  );
}
