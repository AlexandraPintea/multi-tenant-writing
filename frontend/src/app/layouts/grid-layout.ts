import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Store } from '@ngxs/store';

import { authorListOf, selectContentSlice } from '../stores/content/content.selectors';
import { LanguageStore } from '../stores/language.store';
import { SiteConfigStore } from '../stores/site-config.store';

/**
 * roamliterary.com's home (requirements §2.2): a collective, so the grid of
 * author portraits leads rather than a feed of posts. Different DOM, not
 * different CSS — which is exactly why architecture §5.2 selects a whole
 * component on `layout` instead of theming one shared template.
 */
@Component({
  selector: 'app-grid-layout',
  imports: [RouterLink, TranslatePipe],
  template: `
    <section class="intro">
      <h1>{{ siteName() }}</h1>
      <p>{{ 'home.collective' | translate }}</p>
    </section>

    <ul class="author-grid">
      @for (author of authors(); track author.slug) {
        <li class="author-card">
          <a [routerLink]="['/authors', author.slug]">
            @if (author.portrait) {
              <img [src]="author.portrait" [alt]="author.name" />
            }
            <h2>{{ author.name }}</h2>
          </a>
          @if (author.location) {
            <p class="author-card__location">{{ author.location }}</p>
          }
          <p class="author-card__bio">{{ author.bio }}</p>
        </li>
      } @empty {
        <li>{{ 'common.nothingYet' | translate }}</li>
      }
    </ul>
  `,
  styles: `
    .author-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
      gap: 2rem;
      list-style: none;
      padding: 0;
    }
    .author-card img {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
    }
    .author-card a {
      color: inherit;
      text-decoration: none;
    }
    .author-card__location {
      font-size: 0.85rem;
      color: var(--accent);
    }
  `,
})
export class GridLayout {
  private readonly store = inject(Store);
  private readonly content = this.store.selectSignal(selectContentSlice);
  private readonly language = inject(LanguageStore).language;
  private readonly siteConfig = inject(SiteConfigStore);

  protected readonly siteName = computed(() => this.siteConfig.config()?.name ?? '');
  protected readonly authors = computed(() => authorListOf(this.content(), this.language()));
}
