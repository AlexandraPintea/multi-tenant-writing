import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Store } from '@ngxs/store';

import { MediaUrlPipe } from '../../core/media-url.pipe';
import { SeoService } from '../../core/seo';
import { LoadPostList } from '../../stores/content/content.actions';
import { postListOf, selectContentSlice } from '../../stores/content/content.selectors';
import { LanguageStore } from '../../stores/language.store';

/**
 * The full archive. Same preview shape as the homepage block.
 *
 * Category tabs filter the archive in place (requirements §3.4, revised — v1
 * shipped categories as inert labels; the tabs come from the reference design).
 * There is deliberately no "All" tab: clicking the active tab clears the filter,
 * which is how the reference behaves.
 *
 * Switching language re-filters the list rather than translating it in place:
 * the API only returns posts that exist in the active language, so an
 * English-only piece simply leaves the Romanian archive.
 */
@Component({
  selector: 'app-writings-list',
  imports: [RouterLink, TranslatePipe, DatePipe, MediaUrlPipe],
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

  /** Selected category slug, or null for the unfiltered archive. */
  protected readonly activeCategory = signal<string | null>(null);

  /**
   * Tabs are derived from whatever the archive actually contains, so a language
   * whose posts carry different categories gets different tabs. Deduped by slug
   * because the display name is the translated one.
   */
  protected readonly categories = computed(() => {
    const seen = new Map<string, { slug: string; name: string }>();
    for (const post of this.posts()) {
      if (post.category && !seen.has(post.category.slug)) {
        seen.set(post.category.slug, post.category);
      }
    }
    return [...seen.values()];
  });

  protected readonly visiblePosts = computed(() => {
    const active = this.activeCategory();
    if (!active) {
      return this.posts();
    }
    return this.posts().filter((post) => post.category?.slug === active);
  });

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

    // A filter held across a language switch can point at a category the new
    // archive does not have, which would render an empty list under a tab row
    // that no longer contains the selected tab. Drop the filter instead.
    effect(() => {
      const slugs = new Set(this.categories().map((category) => category.slug));
      const active = this.activeCategory();
      if (active && !slugs.has(active)) {
        this.activeCategory.set(null);
      }
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

  protected toggleCategory(slug: string): void {
    this.activeCategory.update((current) => (current === slug ? null : slug));
  }
}
