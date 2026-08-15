import { Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Store } from '@ngxs/store';

import { MediaUrlPipe } from '../../core/media-url.pipe';
import { SeoService } from '../../core/seo';
import { LoadAuthorDetail } from '../../stores/content/content.actions';
import { authorOf, selectContentSlice } from '../../stores/content/content.selectors';
import { LanguageStore } from '../../stores/language.store';

/**
 * One author's profile and their work on *this* site.
 *
 * The embedded posts come from the API's author detail payload, which filters
 * by the requesting site — so Alexandra's Roam page lists only what is
 * published on Roam, including cross-posted pieces (addendum A.2).
 */
@Component({
  selector: 'app-author-detail',
  imports: [RouterLink, TranslatePipe, MediaUrlPipe],
  templateUrl: './author-detail.component.html',
  styleUrl: './author-detail.component.scss',
})
export class AuthorDetailComponent {
  readonly slug = input.required<string>();

  private readonly store = inject(Store);
  private readonly content = this.store.selectSignal(selectContentSlice);
  private readonly language = inject(LanguageStore).language;
  private readonly seo = inject(SeoService);

  protected readonly author = computed(() =>
    authorOf(this.content(), this.slug(), this.language()),
  );

  constructor() {
    // Language switches must re-fetch; the resolver only ran on navigation.
    effect(() => {
      this.store.dispatch(new LoadAuthorDetail(this.slug(), this.language()));
    });

    effect(() => {
      const author = this.author();
      if (!author) {
        return;
      }
      this.seo.apply({
        title: author.name,
        description: author.bio,
        image: author.portrait,
        // "profile" would be more precise, but article vs website is the
        // distinction the unfurlers actually act on.
        type: 'website',
        path: `/authors/${author.slug}`,
      });
    });
  }
}
