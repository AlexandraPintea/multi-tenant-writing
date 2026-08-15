import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Store } from '@ngxs/store';

import { LoadPostList } from '../../stores/content/content.actions';
import { postListOf, selectContentSlice } from '../../stores/content/content.selectors';
import { LanguageStore } from '../../stores/language.store';
import { SiteConfigStore } from '../../stores/site-config.store';

/**
 * alexandrapintea.eu's home (requirements §3.4): portrait-anchored hero, then
 * the three most recent pieces in full-preview form. The title is the link —
 * no "read more" buttons, no carousel.
 */
@Component({
  selector: 'app-editorial-layout',
  imports: [RouterLink, TranslatePipe, DatePipe],
  templateUrl: './editorial-layout.component.html',
  styleUrl: './editorial-layout.component.scss',
})
export class EditorialLayoutComponent {
  private readonly store = inject(Store);
  private readonly content = this.store.selectSignal(selectContentSlice);
  private readonly language = inject(LanguageStore).language;
  private readonly siteConfig = inject(SiteConfigStore);

  protected readonly siteName = computed(() => this.siteConfig.config()?.name ?? '');
  protected readonly recentPosts = computed(() =>
    postListOf(this.content(), this.language()).slice(0, 3),
  );

  constructor() {
    // Language switches must re-fetch; the resolver only ran on navigation.
    effect(() => {
      this.store.dispatch(new LoadPostList(this.language()));
    });
  }
}
