import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Store } from '@ngxs/store';

import { postListOf, selectContentSlice } from '../stores/content/content.selectors';
import { LanguageStore } from '../stores/language.store';
import { SiteConfigStore } from '../stores/site-config.store';

/**
 * alexandrapintea.eu's home (requirements §3.4): portrait-anchored hero, then
 * the three most recent pieces in full-preview form. The title is the link —
 * no "read more" buttons, no carousel.
 */
@Component({
  selector: 'app-editorial-layout',
  imports: [RouterLink, TranslatePipe, DatePipe],
  template: `
    <section class="hero">
      <h1>{{ siteName() }}</h1>
    </section>

    <section class="recent">
      <h2>{{ 'home.recent' | translate }}</h2>
      @for (post of recentPosts(); track post.slug) {
        <article class="preview">
          <p class="preview__meta">
            @if (post.category) {
              <span class="preview__category">{{ post.category.name }}</span>
            }
            <time [attr.datetime]="post.published_at">
              {{ post.published_at | date: 'longDate' }}
            </time>
          </p>
          <h3>
            <a [routerLink]="['/writings', post.slug]">{{ post.title }}</a>
          </h3>
          <p class="preview__excerpt">{{ post.excerpt }}</p>
        </article>
      } @empty {
        <p>{{ 'common.nothingYet' | translate }}</p>
      }
      <a routerLink="/writings">{{ 'home.allWritings' | translate }} →</a>
    </section>
  `,
  styles: `
    .hero h1 {
      font-family: var(--font-display);
      margin-bottom: 2rem;
    }
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
    .preview h3 a {
      color: inherit;
      text-decoration: none;
    }
  `,
})
export class EditorialLayout {
  private readonly store = inject(Store);
  private readonly content = this.store.selectSignal(selectContentSlice);
  private readonly language = inject(LanguageStore).language;
  private readonly siteConfig = inject(SiteConfigStore);

  protected readonly siteName = computed(() => this.siteConfig.config()?.name ?? '');
  protected readonly recentPosts = computed(() =>
    postListOf(this.content(), this.language()).slice(0, 3),
  );
}
