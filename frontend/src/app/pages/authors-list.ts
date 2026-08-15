import { Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Store } from '@ngxs/store';

import { LoadAuthorList } from '../stores/content/content.actions';
import { authorListOf, selectContentSlice } from '../stores/content/content.selectors';
import { LanguageStore } from '../stores/language.store';

@Component({
  selector: 'app-authors-list',
  imports: [RouterLink, TranslatePipe],
  template: `
    <h1>{{ 'authors.title' | translate }}</h1>
    <ul class="authors">
      @for (author of authors(); track author.slug) {
        <li>
          <a [routerLink]="['/authors', author.slug]">{{ author.name }}</a>
          @if (author.location) {
            <span class="authors__location">{{ author.location }}</span>
          }
        </li>
      } @empty {
        <li>{{ 'common.nothingYet' | translate }}</li>
      }
    </ul>
  `,
  styles: `
    .authors {
      list-style: none;
      padding: 0;
    }
    .authors__location {
      margin-left: 0.75rem;
      font-size: 0.85rem;
      color: var(--accent);
    }
  `,
})
export class AuthorsList {
  private readonly store = inject(Store);
  private readonly content = this.store.selectSignal(selectContentSlice);
  private readonly language = inject(LanguageStore).language;

  protected readonly authors = computed(() => authorListOf(this.content(), this.language()));

  constructor() {
    // Language switches must re-fetch; the resolver only ran on navigation.
    effect(() => {
      this.store.dispatch(new LoadAuthorList(this.language()));
    });
  }
}
