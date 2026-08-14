import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Store } from '@ngxs/store';
import { filter, map } from 'rxjs';

import { availableLanguagesOf } from '../../stores/content/content.selectors';
import { selectContentSlice } from '../../stores/content/content.selectors';
import { LanguageStore } from '../../stores/language.store';
import { SiteConfigStore } from '../../stores/site-config.store';

/** Matches /writings/<slug>, but not the /writings list itself. */
const POST_DETAIL = /^\/writings\/([^/?#]+)/;

/**
 * The EN/RO toggle in the top nav.
 *
 * Always present on a bilingual site — it is part of the site's identity
 * (architecture §4.3) — but what it offers depends on what is on screen:
 *
 * - Writings list, home, static pages: both languages live. Switching
 *   re-filters the archive, because the API only returns posts that exist in
 *   the active language.
 * - A bilingual post: both live, and switching swaps the text in place.
 * - A post that exists in one language only: the other side is dimmed and
 *   inert, with a tooltip saying where the piece does exist. Dimming rather
 *   than hiding, so the toggle does not jump around between pages — and inert
 *   rather than clickable, so a reader cannot walk themselves into an empty
 *   page. That is the §9 risk row.
 *
 * Renders nothing at all on a single-language site: roamliterary.com should not
 * show a control with one option.
 */
@Component({
  selector: 'app-language-toggle',
  imports: [TranslatePipe],
  template: `
    @if (isBilingual()) {
      <div class="language-toggle" role="group" [attr.aria-label]="'toggle.label' | translate">
        @for (option of options(); track option.code) {
          <button
            type="button"
            class="language-toggle__option"
            [class.is-active]="option.isActive"
            [class.is-unavailable]="option.isUnavailable"
            [attr.aria-current]="option.isActive ? 'true' : null"
            [attr.aria-disabled]="option.isUnavailable ? 'true' : null"
            [attr.title]="option.tooltip"
            (click)="select(option.code, option.isUnavailable)"
          >
            {{ option.code }}
          </button>
        }
      </div>
    }
  `,
  styles: `
    .language-toggle {
      display: inline-flex;
      gap: 0.5rem;
    }
    .language-toggle__option {
      background: none;
      border: 0;
      padding: 0;
      font: inherit;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: inherit;
      cursor: pointer;
    }
    .language-toggle__option.is-active {
      text-decoration: underline;
      color: var(--accent);
    }
    /* Dimmed, not hidden: the control keeps its shape between pages. */
    .language-toggle__option.is-unavailable {
      opacity: 0.35;
      cursor: not-allowed;
    }
  `,
})
export class LanguageToggle {
  private readonly siteConfig = inject(SiteConfigStore);
  private readonly languageStore = inject(LanguageStore);
  private readonly translate = inject(TranslateService);
  private readonly content = inject(Store).selectSignal(selectContentSlice);
  private readonly router = inject(Router);

  /** Current URL as a signal, so the toggle re-evaluates on navigation. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** The slug when a post detail is on screen, else null. */
  private readonly postSlug = computed(() => POST_DETAIL.exec(this.url())?.[1] ?? null);

  protected readonly isBilingual = computed(() => this.siteConfig.enabledLanguages().length > 1);

  protected readonly options = computed(() => {
    const active = this.languageStore.language();
    const slug = this.postSlug();
    // Empty means "not known yet" — before the post has loaded, nothing is
    // dimmed. Guessing would flicker a disabled control on every navigation.
    const available = slug ? availableLanguagesOf(this.content(), slug) : [];

    return this.siteConfig.enabledLanguages().map((code) => {
      const isUnavailable = available.length > 0 && !available.includes(code) && code !== active;
      return {
        code,
        isActive: code === active,
        isUnavailable,
        tooltip: isUnavailable ? this.unavailableTooltip(available) : null,
      };
    });
  });

  protected select(code: string, isUnavailable: boolean): void {
    if (isUnavailable) {
      return;
    }
    this.languageStore.setLanguage(code);
  }

  private unavailableTooltip(available: string[]): string {
    const names = available.map((code) => this.translate.instant(`language.${code}`)).join(', ');
    return this.translate.instant('toggle.unavailable', { language: names });
  }
}
