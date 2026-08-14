import { Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { LanguageStore } from './stores/language.store';
import { SiteConfigStore } from './stores/site-config.store';

/**
 * The shell both tenants share: one header, one router outlet. Everything that
 * differs between the sites is decided further down — the home route picks its
 * layout from site-config, and the nav hides links a given site has no use for.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly siteConfig = inject(SiteConfigStore);
  private readonly languageStore = inject(LanguageStore);

  protected readonly siteName = computed(() => this.siteConfig.config()?.name ?? '');
  protected readonly activeLanguage = this.languageStore.language;
  protected readonly showAuthors = computed(() => this.siteConfig.layout() === 'grid');

  /** The language the toggle would switch to, or null on a one-language site. */
  protected readonly otherLanguage = computed(() => {
    const enabled = this.siteConfig.enabledLanguages();
    return enabled.find((code) => code !== this.activeLanguage()) ?? null;
  });

  ngOnInit(): void {
    // Route resolvers call this too; the store ignores repeat calls. Kept here
    // so the shell still themes itself on a route that resolves nothing.
    this.siteConfig.loadSiteConfig();
  }

  // Temporary demo control. The real toggle, with its dimming and aria rules,
  // is playbook 2.6.
  protected toggleLanguage(): void {
    const next = this.otherLanguage();
    if (next) {
      this.languageStore.setLanguage(next);
    }
  }
}
