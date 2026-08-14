import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { LanguageStore } from './stores/language.store';
import { SiteConfigStore } from './stores/site-config.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TranslatePipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly title = signal('writing-frontend');

  private readonly siteConfig = inject(SiteConfigStore);
  private readonly languageStore = inject(LanguageStore);

  protected readonly activeLanguage = this.languageStore.language;
  protected readonly enabledLanguages = this.siteConfig.enabledLanguages;

  /** The language the toggle would switch to, or null on a one-language site. */
  protected readonly otherLanguage = computed(() => {
    const enabled = this.enabledLanguages();
    return enabled.find((code) => code !== this.activeLanguage()) ?? null;
  });

  ngOnInit(): void {
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
