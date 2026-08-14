import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Store } from '@ngxs/store';

import { authorOf, selectContentSlice } from '../stores/content/content.selectors';
import { LanguageStore } from '../stores/language.store';

/**
 * One author's profile and their work on *this* site.
 *
 * The embedded posts come from the API's author detail payload, which filters
 * by the requesting site — so Alexandra's Roam page lists only what is
 * published on Roam, including cross-posted pieces (addendum A.2).
 */
@Component({
  selector: 'app-author-detail',
  imports: [RouterLink, TranslatePipe],
  template: `
    @if (author(); as loaded) {
      <article>
        @if (loaded.portrait) {
          <img [src]="loaded.portrait" [alt]="loaded.name" class="portrait" />
        }
        <h1>{{ loaded.name }}</h1>
        @if (loaded.location) {
          <p class="location">{{ loaded.location }}</p>
        }
        <p class="bio">{{ loaded.bio }}</p>

        <ul class="posts">
          @for (post of loaded.posts ?? []; track post.slug) {
            <li>
              <a [routerLink]="['/writings', post.slug]">{{ post.title }}</a>
            </li>
          } @empty {
            <li>{{ 'common.nothingYet' | translate }}</li>
          }
        </ul>
      </article>
    } @else {
      <p>{{ 'common.notFound' | translate }}</p>
    }
  `,
  styles: `
    .portrait {
      max-width: 16rem;
      aspect-ratio: 1;
      object-fit: cover;
    }
    .location {
      color: var(--accent);
    }
    .posts {
      list-style: none;
      padding: 0;
    }
  `,
})
export class AuthorDetail {
  readonly slug = input.required<string>();

  private readonly content = inject(Store).selectSignal(selectContentSlice);
  private readonly language = inject(LanguageStore).language;

  protected readonly author = computed(() =>
    authorOf(this.content(), this.slug(), this.language()),
  );
}
