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
} from '../../stores/content/content.selectors';
import { CommentFormComponent } from '../../components/comment-form/comment-form.component';
import { CommentListComponent } from '../../components/comment-list/comment-list.component';
import { NextPostLinkComponent } from '../../components/next-post-link/next-post-link.component';
import { SeoService } from '../../core/seo';
import { LoadPostDetail } from '../../stores/content/content.actions';
import { LanguageStore } from '../../stores/language.store';

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
  imports: [
    RouterLink,
    TranslatePipe,
    DatePipe,
    NextPostLinkComponent,
    CommentListComponent,
    CommentFormComponent,
  ],
  templateUrl: './post-detail.component.html',
  styleUrl: './post-detail.component.scss',
})
export class PostDetailComponent {
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
