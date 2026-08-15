import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Store } from '@ngxs/store';

import {
  availableLanguagesOf,
  isNotInLanguageOf,
  postOf,
  selectContentSlice,
} from '../stores/content/content.selectors';
import { SeoService } from '../core/seo';
import { LoadPostDetail } from '../stores/content/content.actions';
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
          {{ 'post.notInLanguage' | translate: { languages: availableLanguageNames() } }}
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

  private readonly store = inject(Store);
  private readonly content = this.store.selectSignal(selectContentSlice);
  private readonly language = inject(LanguageStore).language;
  private readonly translate = inject(TranslateService);
  private readonly seo = inject(SeoService);

  constructor() {
    // Switching language on a post has to fetch that language's copy — the
    // resolver ran once, on navigation. A post already cached in this language
    // costs nothing, and one known to lack it is never re-requested.
    effect(() => {
      this.store.dispatch(new LoadPostDetail(this.slug(), this.language()));
    });

    // The highest-stakes unfurl in the project: a post URL pasted into Slack or
    // WhatsApp has to come back with the title, excerpt and cover image.
    effect(() => {
      const post = this.post();
      if (!post) {
        return;
      }
      this.seo.apply({
        title: post.title,
        description: post.excerpt,
        image: post.cover_image,
        type: 'article',
        path: `/writings/${post.slug}`,
      });
    });
  }

  protected readonly post = computed(() => postOf(this.content(), this.slug(), this.language()));
  protected readonly notInLanguage = computed(() =>
    isNotInLanguageOf(this.content(), this.slug(), this.language()),
  );
  protected readonly availableLanguages = computed(() =>
    availableLanguagesOf(this.content(), this.slug()),
  );
  /**
   * "engleză" reads better than "en" in the fallback sentence.
   *
   * The read of language() is load-bearing, not decoration: translate.instant()
   * is a plain call, so nothing here would re-run when the language changes and
   * a Romanian page rendered "disponibil doar în English".
   */
  protected readonly availableLanguageNames = computed(() => {
    this.language();
    return this.availableLanguages()
      .map((code) => this.translate.instant(`language.${code}`))
      .join(', ');
  });
}
