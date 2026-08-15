import { Component, computed, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { LanguageToggleComponent } from './components/language-toggle/language-toggle.component';
import { SiteFooterComponent } from './components/site-footer/site-footer.component';
import { MediaUrlPipe } from './core/media-url.pipe';
import { SiteConfigStore } from './stores/site-config.store';

/**
 * The shell both tenants share: one header, one router outlet. Everything that
 * differs between the sites is decided further down — the home route picks its
 * layout from site-config, the nav hides links a given site has no use for, and
 * the toggle decides for itself whether to render.
 */
@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
    LanguageToggleComponent,
    SiteFooterComponent,
    MediaUrlPipe,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly siteConfig = inject(SiteConfigStore);

  protected readonly siteName = computed(() => this.siteConfig.config()?.name ?? '');
  protected readonly logo = this.siteConfig.logo;
  protected readonly showAuthors = computed(() => this.siteConfig.layout() === 'grid');

  ngOnInit(): void {
    // Route resolvers call this too; the store ignores repeat calls. Kept here
    // so the shell still themes itself on a route that resolves nothing.
    this.siteConfig.loadSiteConfig();
  }
}
