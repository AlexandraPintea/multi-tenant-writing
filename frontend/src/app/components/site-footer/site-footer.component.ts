import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { SiteConfigStore } from '../../stores/site-config.store';
import { socialIconPath, socialSortKey } from './social-icons';

/** One entry from Site.social_links, resolved into something renderable. */
interface SocialLink {
  /** The raw key, e.g. "instagram". Used to label the link. */
  key: string;
  href: string;
  /** Not rendered visibly — the icon is. Carried for assistive tech and tooltip. */
  label: string;
  /** SVG path data; the globe for a key we have no glyph for. */
  icon: string;
}

/** Keys whose value is an address rather than a URL. */
const MAILTO_KEYS = ['email', 'mail', 'e-mail'];

/**
 * The shared footer: copyright plus whatever social links the tenant defines.
 *
 * Both come off the Site row rather than the bundle, so the two sites can
 * differ and neither needs a deploy to change — the same reasoning as the logo.
 *
 * The keys are free-form (requirements: "email, instagram, facebook or others"),
 * so nothing here enumerates networks. A key that arrives tomorrow renders
 * tomorrow, with the globe icon and a label taken from the key itself.
 *
 * Only the icon shows; the network name rides along as visually-hidden text so
 * the link still has an accessible name and a tooltip.
 */
@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './site-footer.component.html',
  styleUrl: './site-footer.component.scss',
})
export class SiteFooterComponent {
  private readonly siteConfig = inject(SiteConfigStore);

  protected readonly links = computed<SocialLink[]>(() =>
    Object.entries(this.siteConfig.socialLinks())
      // A key with an empty value is a half-filled admin form, not a link.
      .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
      .map(([key, value]) => ({
        key,
        href: this.href(key, value.trim()),
        label: this.label(key),
        icon: socialIconPath(key),
      }))
      // jsonb does not preserve the key order the admin typed, so impose one.
      .sort((a, b) => {
        const [rankA, nameA] = socialSortKey(a.key);
        const [rankB, nameB] = socialSortKey(b.key);
        return rankA - rankB || nameA.localeCompare(nameB);
      }),
  );

  /**
   * Blank copyright_text means "© <year> <name>", computed here rather than
   * stored, so it does not go stale on New Year's Day. Reading the year at
   * render time is safe for SSR: a server render in December and a hydration in
   * January differ by a character nobody will see.
   */
  protected readonly copyright = computed(() => {
    const stored = this.siteConfig.copyrightText().trim();
    if (stored) {
      return stored;
    }
    const name = this.siteConfig.config()?.name ?? '';
    return name ? `© ${new Date().getFullYear()} ${name}` : '';
  });

  private href(key: string, value: string): string {
    if (/^(https?:|mailto:|tel:)/.test(value)) {
      return value;
    }
    // An email typed as a bare address is the likely case; anything else
    // relative is left alone so a site can point at its own /contact.
    return MAILTO_KEYS.includes(key.toLowerCase()) ? `mailto:${value}` : value;
  }

  /** "instagram" -> "Instagram". Not translated: these are proper nouns. */
  private label(key: string): string {
    return key.charAt(0).toUpperCase() + key.slice(1);
  }
}
