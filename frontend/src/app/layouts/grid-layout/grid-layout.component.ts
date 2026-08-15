import { Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Store } from '@ngxs/store';

import { MediaUrlPipe } from '../../core/media-url.pipe';
import { LoadAuthorList } from '../../stores/content/content.actions';
import { authorListOf, selectContentSlice } from '../../stores/content/content.selectors';
import { LanguageStore } from '../../stores/language.store';
import { SiteConfigStore } from '../../stores/site-config.store';

/**
 * roamliterary.com's home (requirements §2.2): a collective, so the grid of
 * author portraits leads rather than a feed of posts. Different DOM, not
 * different CSS — which is exactly why architecture §5.2 selects a whole
 * component on `layout` instead of theming one shared template.
 */
@Component({
  selector: 'app-grid-layout',
  imports: [RouterLink, TranslatePipe, MediaUrlPipe],
  templateUrl: './grid-layout.component.html',
  styleUrl: './grid-layout.component.scss',
})
export class GridLayoutComponent {
  private readonly store = inject(Store);
  private readonly content = this.store.selectSignal(selectContentSlice);
  private readonly language = inject(LanguageStore).language;
  private readonly siteConfig = inject(SiteConfigStore);

  protected readonly siteName = computed(() => this.siteConfig.config()?.name ?? '');
  protected readonly authors = computed(() => authorListOf(this.content(), this.language()));

  constructor() {
    // Language switches must re-fetch; the resolver only ran on navigation.
    effect(() => {
      this.store.dispatch(new LoadAuthorList(this.language()));
    });
  }
}
